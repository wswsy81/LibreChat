const express = require('express');
const request = require('supertest');

const mockEngine = { json: jest.fn(), text: jest.fn() };
const mockFindOne = jest.fn();
const mockLogger = { error: jest.fn() };
const mockLifeShareLimiter = jest.fn((_req, _res, next) => next());

jest.mock('@librechat/api', () => ({
  createLifeEngineClient: jest.fn(() => mockEngine),
  LifeEngineError: class LifeEngineError extends Error {
    constructor(status, message, payload) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
}));

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));
jest.mock('mongoose', () => ({
  models: { Conversation: { findOne: (...args) => mockFindOne(...args) } },
}));
jest.mock('~/server/middleware/limiters', () => ({
  lifeShareLimiter: (...args) => mockLifeShareLimiter(...args),
}));
jest.mock('~/server/middleware/optionalJwtAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (_req, _res, next) => next());

const lifeRouter = require('./life');

function conversationQuery(value) {
  return {
    sort: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
    })),
  };
}

function buildApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use('/api/life', lifeRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockReturnValue(conversationQuery(null));
});

test('anonymous bootstrap stays on the product home without calling future-engine', async () => {
  const response = await request(buildApp()).get('/api/life/bootstrap');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    authenticated: false,
    user: null,
    profileState: 'empty',
    hasSubstantiveProfile: false,
    recommendedRoute: '/home',
  });
  expect(mockEngine.json).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toContain('no-store');
});

test('public share reads pass through the dedicated IP limiter', async () => {
  mockEngine.json.mockResolvedValue({
    schemaVersion: 1,
    report: { id: 'report-1', title: '报告', html: '<html></html>' },
  });

  const response = await request(buildApp()).get('/api/life/shares/share-token');

  expect(response.status).toBe(200);
  expect(mockLifeShareLimiter).toHaveBeenCalledTimes(1);
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/shares/share-token');
});

test('authenticated bootstrap merges archive state with the latest valid conversation', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'ready',
    hasSubstantiveProfile: true,
    summary: { lastSurface: '转型后收入不稳定' },
  });
  mockFindOne.mockReturnValue(
    conversationQuery({
      conversationId: 'conversation-1',
      title: '转型后的现金流',
    }),
  );

  const response = await request(
    buildApp({ id: 'user-1', name: '张东', email: 'z@example.com' }),
  ).get('/api/life/bootstrap');

  expect(response.status).toBe(200);
  expect(response.body.recommendedRoute).toBe('/resume');
  expect(response.body.lastConversationId).toBe('conversation-1');
  expect(response.body.summary.lastSurface).toBe('转型后收入不稳定');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/bootstrap', { userId: 'user-1' });
  expect(mockFindOne).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      spec: 'future-lines',
      isTemporary: { $ne: true },
      'messages.0': { $exists: true },
    }),
  );
});

test('onboarding validates all four bars and returns a one-time auto-submit route', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  const invalid = await request(app)
    .post('/api/life/onboarding')
    .send({
      archiveName: '张东',
      dashboards: { health: 5, work: 5, play: 5 },
    });
  expect(invalid.status).toBe(422);

  mockEngine.json.mockResolvedValue({ ok: true, profileVersion: 'v1', applied: 5 });
  const valid = await request(app)
    .post('/api/life/onboarding')
    .send({
      archiveName: '张东',
      dashboards: { health: 6, work: 3, play: 7, love: 5 },
      birthOptIn: false,
    });
  expect(valid.status).toBe(200);
  expect(valid.body.route).toMatch(/^\/c\/new\?/);
  expect(valid.body.route).toContain('submit=true');
  expect(decodeURIComponent(valid.body.route)).toContain('最低的是「工作」');
});

test('resume restores an existing conversation and only creates D-mode when none exists', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockFindOne.mockReturnValueOnce(conversationQuery({ conversationId: 'conversation-1' }));
  const restored = await request(app).post('/api/life/resume');
  expect(restored.body).toEqual({
    action: 'restored',
    conversationId: 'conversation-1',
    route: '/c/conversation-1',
  });

  mockFindOne.mockReturnValueOnce(conversationQuery(null));
  const created = await request(app).post('/api/life/resume');
  expect(created.body.action).toBe('new');
  expect(decodeURIComponent(created.body.route)).toContain('先读回我的人生存档');
});

test('private report HTML forwards the trusted owner and applies a restrictive CSP', async () => {
  mockEngine.text.mockResolvedValue('<html><body>报告</body></html>');
  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/reports/report-1/html',
  );
  expect(response.status).toBe(200);
  expect(response.text).toContain('报告');
  expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  expect(mockEngine.text).toHaveBeenCalledWith('/internal/reports/report-1/html', {
    userId: 'user-1',
  });
});

test('share creation exposes only the branded public route, never the raw engine token URL', async () => {
  mockEngine.json.mockResolvedValue({ shareId: 'share-1', token: 'secret-token', expiresAt: null });
  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/reports/report-1/shares')
    .send({ expiresAt: null });
  expect(response.status).toBe(201);
  expect(response.body).toEqual({
    shareId: 'share-1',
    expiresAt: null,
    shareUrl: '/s/archive/secret-token',
  });
});
