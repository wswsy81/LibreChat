const express = require('express');
const request = require('supertest');

const mockEngine = { json: jest.fn(), text: jest.fn() };
const mockFindOne = jest.fn();
const mockLogger = { error: jest.fn() };
const mockLifeShareLimiter = jest.fn((_req, _res, next) => next());
const mockRunLifeOperation = jest.fn();
const mockApplyRuntimeConfig = jest.fn();
const mockReadRedactedPolicyBundle = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createLifeEngineClient: jest.fn(() => mockEngine),
  applyRuntimeConfig: (...args) => mockApplyRuntimeConfig(...args),
  readRedactedPolicyBundle: (...args) => mockReadRedactedPolicyBundle(...args),
  LifeEngineError: class LifeEngineError extends Error {
    constructor(status, message, payload) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    models: { ...actual.models, Conversation: { findOne: (...args) => mockFindOne(...args) } },
  };
});
jest.mock('~/server/middleware/limiters', () => ({
  lifeShareLimiter: (...args) => mockLifeShareLimiter(...args),
}));
jest.mock('~/server/services/lifeOperations', () => ({
  runLifeOperation: (...args) => mockRunLifeOperation(...args),
  LifeOperationPendingError: class LifeOperationPendingError extends Error {},
  LifeOperationConflictError: class LifeOperationConflictError extends Error {},
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
  mockReadRedactedPolicyBundle.mockResolvedValue({ runtime: {}, security: {} });
  mockRunLifeOperation.mockImplementation(async ({ executor, operation }) => ({
    ...(await executor({
      operationId: `operation-${operation}`,
      requestHash: 'a'.repeat(64),
    })),
    replayed: false,
  }));
});

test('ADMIN can read redacted runtime config with active engine SHA summary', async () => {
  mockEngine.json.mockResolvedValue({
    policy: { runtime: { sha256: 'a' }, security: { sha256: 'b' } },
  });
  const response = await request(buildApp({ id: 'admin-1', role: 'ADMIN' })).get(
    '/api/life/admin/runtime-config',
  );
  expect(response.status).toBe(200);
  expect(mockReadRedactedPolicyBundle).toHaveBeenCalledTimes(1);
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/runtime-config');
});

test('ADMIN runtime config apply delegates validation、backup、atomic reload and rollback', async () => {
  mockApplyRuntimeConfig.mockResolvedValue({ applied: true, policyVersion: 'runtime-v2' });
  const document = {
    schemaVersion: 1,
    policyVersion: 'runtime-v2',
    updatedAt: '2026-07-27T00:00:00.000Z',
    reason: 'owner change',
  };
  const response = await request(buildApp({ id: 'admin-1', role: 'ADMIN' }))
    .post('/api/life/admin/runtime-config/apply')
    .send({ kind: 'runtime', document });
  expect(response.status).toBe(200);
  expect(mockApplyRuntimeConfig).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'runtime',
      document,
      actorId: 'admin-1',
    }),
  );
});

test('ADMIN can replay one redacted fixture across published and draft Product Packs', async () => {
  const body = {
    sourceProductId: 'archetype-playground-v1',
    fixtureId: 'deadline-alchemist-card',
    targetProductIds: ['futureline-current-v1', 'archetype-playground-v1'],
  };
  mockEngine.json.mockResolvedValue({
    schemaVersion: 1,
    source: { fixture: { id: body.fixtureId, payloadSha256: 'a'.repeat(64) } },
    targets: body.targetProductIds.map((id) => ({ product: { id }, passed: true })),
  });

  const response = await request(buildApp({ id: 'admin-1', role: 'ADMIN' }))
    .post('/api/life/admin/product-runtime/preview')
    .send(body);

  expect(response.status).toBe(200);
  expect(response.body.targets).toHaveLength(2);
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/product-runtime/preview', {
    method: 'POST',
    body,
  });
});

test('Product Pack preview rejects arbitrary payloads, duplicate targets and non-ADMIN callers', async () => {
  const admin = buildApp({ id: 'admin-1', role: 'ADMIN' });
  const invalid = await request(admin)
    .post('/api/life/admin/product-runtime/preview')
    .send({
      sourceProductId: 'archetype-playground-v1',
      fixtureId: 'deadline-alchemist-card',
      targetProductIds: ['futureline-current-v1', 'futureline-current-v1'],
      payload: { profile: 'raw-user-data' },
    });
  expect(invalid.status).toBe(422);
  expect(invalid.body.error.code).toBe('PRODUCT_PREVIEW_REQUEST_INVALID');
  expect(mockEngine.json).not.toHaveBeenCalled();

  const forbidden = await request(buildApp({ id: 'user-1', role: 'USER' }))
    .post('/api/life/admin/product-runtime/preview')
    .send({
      sourceProductId: 'archetype-playground-v1',
      fixtureId: 'deadline-alchemist-card',
      targetProductIds: ['futureline-current-v1'],
    });
  expect(forbidden.status).toBe(403);
  expect(mockEngine.json).not.toHaveBeenCalled();
});

test('ADMIN 观测看板只拿到聚合结果，查询参数越界不打 engine', async () => {
  mockEngine.json.mockResolvedValue({
    schemaVersion: 1,
    individualTracesExposed: false,
    windowDays: 7,
    groups: [
      {
        snapshotId: 'a'.repeat(64),
        productId: 'futureline-current-v1',
        experiment: { id: 'advisor-pack-rollout-v1', variant: 'control' },
        sampleSize: 3,
        successCount: 3,
        failureCount: 0,
      },
    ],
  });

  const response = await request(buildApp({ id: 'admin-1', role: 'ADMIN' })).get(
    '/api/life/admin/product-observability/results?windowDays=7&experimentId=advisor-pack-rollout-v1',
  );

  expect(response.status).toBe(200);
  expect(response.body.individualTracesExposed).toBe(false);
  expect(response.body.groups).toHaveLength(1);
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/product-observability/results?windowDays=7&experimentId=advisor-pack-rollout-v1',
  );

  mockEngine.json.mockClear();
  const rejectedWindow = await request(buildApp({ id: 'admin-1', role: 'ADMIN' })).get(
    '/api/life/admin/product-observability/results?windowDays=365',
  );
  expect(rejectedWindow.status).toBe(422);
  expect(rejectedWindow.body.error.code).toBe('PRODUCT_OBSERVABILITY_QUERY_INVALID');

  const rejectedExperiment = await request(buildApp({ id: 'admin-1', role: 'ADMIN' })).get(
    '/api/life/admin/product-observability/results?experimentId=../private',
  );
  expect(rejectedExperiment.status).toBe(422);

  const rejectedField = await request(buildApp({ id: 'admin-1', role: 'ADMIN' })).get(
    '/api/life/admin/product-observability/results?userId=user-1',
  );
  expect(rejectedField.status).toBe(422);
  expect(mockEngine.json).not.toHaveBeenCalled();

  const forbidden = await request(buildApp({ id: 'user-1', role: 'USER' })).get(
    '/api/life/admin/product-observability/results',
  );
  expect(forbidden.status).toBe(403);
  expect(mockEngine.json).not.toHaveBeenCalled();
});

test('ADMIN 规矩页：读、存、回滚各自走引擎校验，非 ADMIN 一律拒绝', async () => {
  const admin = buildApp({ id: 'admin-1', role: 'ADMIN' });
  mockEngine.json.mockResolvedValue({
    schemaVersion: 1,
    configurationVersion: 'v1',
    updatedAt: null,
    sha256: 'a'.repeat(64),
    rules: [
      {
        id: 'astrology-terms',
        status: 'published',
        severity: 'M',
        targets: ['artifact.narrative'],
        kind: 'forbid_any',
        params: { terms: ['八字'], patterns: [] },
        action: 'reject',
      },
    ],
  });

  const read = await request(admin).get('/api/life/admin/rules');
  expect(read.status).toBe(200);
  expect(read.body.rules).toHaveLength(1);
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/rules');

  const forbiddenRead = await request(buildApp({ id: 'user-1', role: 'USER' })).get(
    '/api/life/admin/rules',
  );
  expect(forbiddenRead.status).toBe(403);

  const forbiddenWrite = await request(buildApp({ id: 'user-1', role: 'USER' }))
    .put('/api/life/admin/rules')
    .send({ schemaVersion: 1, configurationVersion: 'v1', rules: [] });
  expect(forbiddenWrite.status).toBe(403);

  const forbiddenRollback = await request(buildApp({ id: 'user-1', role: 'USER' }))
    .post('/api/life/admin/rules/rollback')
    .send({ rollbackId: 'x'.repeat(24) });
  expect(forbiddenRollback.status).toBe(403);

  const badRollback = await request(admin).post('/api/life/admin/rules/rollback').send({});
  expect(badRollback.status).toBe(422);
  expect(badRollback.body.error.code).toBe('RULES_ROLLBACK_INVALID');
});

test('non-ADMIN cannot read or apply runtime config', async () => {
  const app = buildApp({ id: 'user-1', role: 'USER' });

  const read = await request(app).get('/api/life/admin/runtime-config');
  const apply = await request(app)
    .post('/api/life/admin/runtime-config/apply')
    .send({ kind: 'runtime', document: { schemaVersion: 1 } });

  expect(read.status).toBe(403);
  expect(apply.status).toBe(403);
  expect(mockReadRedactedPolicyBundle).not.toHaveBeenCalled();
  expect(mockApplyRuntimeConfig).not.toHaveBeenCalled();
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

test('onboarding accepts archiveName + entryHouse and returns a one-time house trigger route', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  const missingKey = await request(app).post('/api/life/onboarding').send({
    archiveName: '张东',
    entryHouse: 'h10',
  });
  expect(missingKey.status).toBe(400);
  expect(missingKey.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');

  mockEngine.json.mockResolvedValue({
    ok: true,
    profileVersion: 'v1',
    applied: 1,
    entryEvent: {
      kind: 'house_entered',
      entryHouse: 'h10',
      visitMode: 'first_entry',
      at: '2026-07-24T12:00:00.000Z',
    },
  });
  const valid = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'onboarding-1')
    .send({
      archiveName: '张东',
      entryHouse: 'h10',
    });
  expect(valid.status).toBe(200);
  const prompt = new URL(valid.body.route, 'https://yiweilife.test').searchParams.get('q');
  expect(prompt).toBe('[trigger:house_entered] entryHouse=h10;visitMode=first_entry');
  expect(valid.body.entryEvent.entryHouse).toBe('h10');
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/onboarding',
    expect.objectContaining({ body: { archiveName: '张东', entryHouse: 'h10' } }),
  );

  const legacy = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'onboarding-legacy')
    .send({
      archiveName: '张东',
      dashboards: { health: 6, work: 3, play: 7, love: 5 },
    });
  expect(legacy.status).toBe(422);
  expect(legacy.body.error.code).toBe('INVALID_ENTRY_HOUSE');

  const retired = await request(app)
    .post('/api/life/diagnostics/blood-bars')
    .set('Idempotency-Key', 'diagnostic-retired')
    .send({ dashboards: { work: 3 } });
  expect(retired.status).toBe(404);
});

test('resume restores an existing conversation and only creates D-mode when none exists', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockFindOne.mockReturnValueOnce(conversationQuery({ conversationId: 'conversation-1' }));
  const restored = await request(app).post('/api/life/resume').set('Idempotency-Key', 'resume-1');
  expect(restored.body).toEqual({
    action: 'restored',
    conversationId: 'conversation-1',
    route: '/c/conversation-1',
  });

  mockFindOne.mockReturnValueOnce(conversationQuery(null));
  const created = await request(app).post('/api/life/resume').set('Idempotency-Key', 'resume-2');
  expect(created.body.action).toBe('new');
  expect(decodeURIComponent(created.body.route)).toContain('先读回我的人生存档');
  const resumePrompt = new URL(created.body.route, 'https://yiweilife.test').searchParams.get('q');
  expect(resumePrompt).toContain('[trigger:session_resumed] 我回来了');
});

test('same idempotency key with changed payload returns a non-retryable 409', async () => {
  const error = new Error('payload conflict');
  error.code = 'LIFE_OPERATION_CONFLICT';
  mockRunLifeOperation.mockRejectedValueOnce(error);

  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/basics')
    .set('Idempotency-Key', 'same-key')
    .send({ nickname: '另一个值' });

  expect(response.status).toBe(409);
  expect(response.body.error).toMatchObject({
    code: 'LIFE_OPERATION_CONFLICT',
    retryable: false,
  });
});

test('basics preserves explicit null clears across the API boundary', async () => {
  mockEngine.json.mockResolvedValue({ ok: true, basics: {} });

  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/basics')
    .set('Idempotency-Key', 'clear-basics')
    .send({ occupation: null, city: null });

  expect(response.status).toBe(200);
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/basics',
    expect.objectContaining({ body: { occupation: null, city: null } }),
  );
  expect(mockRunLifeOperation).toHaveBeenCalledWith(
    expect.objectContaining({ requestPayload: { occupation: null, city: null } }),
  );
});

test('basics forwards editable registration facts across the API boundary', async () => {
  mockEngine.json.mockResolvedValue({ ok: true, basics: {} });

  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/basics')
    .set('Idempotency-Key', 'registration-facts')
    .send({ gender: '女', age: '38', city: '杭州' });

  expect(response.status).toBe(200);
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/basics',
    expect.objectContaining({ body: { gender: '女', age: '38', city: '杭州' } }),
  );
  expect(mockRunLifeOperation).toHaveBeenCalledWith(
    expect.objectContaining({ requestPayload: { gender: '女', age: '38', city: '杭州' } }),
  );
});

test('inbox trims captures, proxies the trusted user, and rejects empty text', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });

  const empty = await request(app).post('/api/life/inbox').send({ text: '   ' });
  expect(empty.status).toBe(422);
  expect(empty.body.error.code).toBe('INBOX_EMPTY');
  expect(mockEngine.json).not.toHaveBeenCalled();

  mockEngine.json.mockResolvedValueOnce({
    ok: true,
    entry: {
      id: 'entry-1',
      text: '今天终于推进了一步',
      capturedAt: '2026-07-13T08:00:00.000Z',
      digested: false,
      digestedAt: null,
    },
  });
  const created = await request(app)
    .post('/api/life/inbox')
    .send({ text: '  今天终于推进了一步  ' });
  expect(created.status).toBe(201);
  expect(created.body.entry.id).toBe('entry-1');
  expect(mockEngine.json).toHaveBeenLastCalledWith('/internal/inbox', {
    userId: 'user-1',
    method: 'POST',
    body: { text: '今天终于推进了一步' },
  });

  mockEngine.json.mockResolvedValueOnce({ schemaVersion: 1, items: [created.body.entry] });
  const listed = await request(app).get('/api/life/inbox');
  expect(listed.status).toBe(200);
  expect(listed.body.items).toHaveLength(1);
  expect(mockEngine.json).toHaveBeenLastCalledWith('/internal/inbox', { userId: 'user-1' });
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
  const app = buildApp({ id: 'user-1', name: '张东' });
  const missingKey = await request(app)
    .post('/api/life/reports/report-1/shares')
    .send({ expiresAt: null });
  expect(missingKey.status).toBe(400);

  mockEngine.json.mockImplementation(async (_path, options) => ({
    shareId: 'share-1',
    token: options.body.token,
    expiresAt: null,
  }));
  const response = await request(app)
    .post('/api/life/reports/report-1/shares')
    .set('Idempotency-Key', 'share-gesture-1')
    .send({ expiresAt: null });
  expect(response.status).toBe(201);
  expect(response.body.shareId).toBe('share-1');
  expect(response.body.expiresAt).toBeNull();
  expect(response.body.shareUrl).toMatch(/^\/s\/archive\/[A-Za-z0-9_-]{43}$/);

  const replay = await request(app)
    .post('/api/life/reports/report-1/shares')
    .set('Idempotency-Key', 'share-gesture-1')
    .send({ expiresAt: null });
  expect(replay.body.shareUrl).toBe(response.body.shareUrl);
  expect(mockEngine.json.mock.calls[0][1].body.token).toBe(
    mockEngine.json.mock.calls[1][1].body.token,
  );
});

test('N1: map html passes view=full through; house annotate requires idempotency and proxies engine', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });

  mockEngine.text.mockResolvedValue('<html>full</html>');
  const full = await request(app).get('/api/life/map/html?view=full');
  expect(full.status).toBe(200);
  expect(mockEngine.text).toHaveBeenCalledWith('/internal/map/html?view=full', {
    userId: 'user-1',
  });

  const missingKey = await request(app)
    .post('/api/life/map/houses/annotate')
    .send({ houseKey: 'h2', action: 'keep' });
  expect(missingKey.status).toBe(400);

  mockEngine.json.mockResolvedValue({ ok: true, house: { status: 'confirmed', conf: 0.9 } });
  const annotated = await request(app)
    .post('/api/life/map/houses/annotate')
    .set('Idempotency-Key', 'map-house-1')
    .send({ houseKey: 'h2', action: 'keep' });
  expect(annotated.status).toBe(200);
  expect(annotated.body.house.status).toBe('confirmed');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/map/houses/annotate', {
    userId: 'user-1',
    method: 'POST',
    body: { houseKey: 'h2', action: 'keep', text: undefined },
    operation: {
      id: 'operation-map-house-annotate',
      name: 'map-house-annotate',
      requestHash: 'a'.repeat(64),
    },
  });

  const invalid = await request(app)
    .post('/api/life/map/houses/annotate')
    .set('Idempotency-Key', 'map-house-2')
    .send({ houseKey: '', action: 'keep' });
  expect(invalid.status).toBe(422);
});
