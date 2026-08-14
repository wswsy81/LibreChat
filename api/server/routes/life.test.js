const express = require('express');
const request = require('supertest');

const mockEngine = { json: jest.fn(), text: jest.fn() };
const mockConversationFind = jest.fn();
const mockMessageFind = jest.fn();
const mockLogger = { error: jest.fn() };
const mockLifeShareLimiter = jest.fn((_req, _res, next) => next());
const mockRunLifeOperation = jest.fn();
const mockFinalizeLifeOperationResult = jest.fn();
const mockHashLifeOperationPayload = jest.fn((value) =>
  require('crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex'),
);
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
    models: {
      ...actual.models,
      Conversation: { find: (...args) => mockConversationFind(...args) },
      Message: { find: (...args) => mockMessageFind(...args) },
    },
  };
});
jest.mock('~/server/middleware/limiters', () => ({
  lifeShareLimiter: (...args) => mockLifeShareLimiter(...args),
}));
jest.mock('~/server/services/lifeOperations', () => ({
  runLifeOperation: (...args) => mockRunLifeOperation(...args),
  finalizeLifeOperationResult: (...args) => mockFinalizeLifeOperationResult(...args),
  hashLifeOperationPayload: (...args) => mockHashLifeOperationPayload(...args),
  LifeOperationPendingError: class LifeOperationPendingError extends Error {},
  LifeOperationConflictError: class LifeOperationConflictError extends Error {},
}));
jest.mock('~/server/middleware/optionalJwtAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (_req, _res, next) => next());

const lifeRouter = require('./life');
const { resetLocalDataOperationStateForTests } = require('~/server/utils/futureLinesLocalData');

function conversationQuery(value) {
  const conversations = value.map((conversation) =>
    Object.hasOwn(conversation, 'messages')
      ? conversation
      : { ...conversation, messages: ['root', 'assistant', 'followup'] },
  );
  return {
    sort: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(conversations) })),
      })),
    })),
  };
}

function messageQuery(value) {
  return {
    select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
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
  mockEngine.json.mockReset();
  mockEngine.text.mockReset();
  mockConversationFind.mockReset();
  mockMessageFind.mockReset();
  mockConversationFind.mockReturnValue(conversationQuery([]));
  mockMessageFind.mockReturnValue(messageQuery([]));
  mockReadRedactedPolicyBundle.mockResolvedValue({ runtime: {}, security: {} });
  mockFinalizeLifeOperationResult.mockResolvedValue({ updated: 0 });
  mockRunLifeOperation.mockImplementation(async ({ executor, operation }) => ({
    ...(await executor({
      operationId: `operation-${operation}`,
      requestHash: 'a'.repeat(64),
    })),
    replayed: false,
  }));
  resetLocalDataOperationStateForTests();
});

test('device-local beta restores from browser summaries without reading or writing Mongo', async () => {
  const previous = {
    enabled: process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED,
    ids: process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS,
  };
  process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED = 'true';
  process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS = 'local-user';
  try {
    mockEngine.json.mockImplementation(async (pathname, options) => {
      if (pathname === '/internal/local-data/session') {
        return { schemaVersion: 1, sessionId: 'session-1' };
      }
      if (pathname === '/internal/bootstrap') {
        return {
          activeHouse: 'h6',
          houseSessions: [{ entryHouse: 'h6', sessionId: 'local-conversation' }],
        };
      }
      if (pathname === '/internal/onboarding') {
        return {
          ok: true,
          entryEvent: {
            kind: 'house_entered',
            entryHouse: options.body.entryHouse,
            visitMode: 'continue',
            at: '2026-08-14T00:00:00.000Z',
          },
        };
      }
      throw new Error(`unexpected engine path: ${pathname}`);
    });

    const response = await request(buildApp({ id: 'local-user', name: '本地用户' }))
      .post('/api/life/onboarding')
      .set('Idempotency-Key', 'local-onboarding')
      .send({
        archiveName: '本地用户',
        entryHouse: 'h6',
        localConversations: [
          {
            conversationId: 'local-conversation',
            title: '只在手机上的对话',
            updatedAt: '2026-08-14T00:00:00.000Z',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      action: 'restored',
      conversationId: 'local-conversation',
      route: '/c/local-conversation',
    });
    expect(mockConversationFind).not.toHaveBeenCalled();
    expect(mockMessageFind).not.toHaveBeenCalled();
    expect(mockRunLifeOperation).not.toHaveBeenCalled();
    expect(mockFinalizeLifeOperationResult).not.toHaveBeenCalled();
  } finally {
    if (previous.enabled === undefined) delete process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED;
    else process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED = previous.enabled;
    if (previous.ids === undefined) delete process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS;
    else process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS = previous.ids;
  }
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
  mockConversationFind.mockReturnValue(
    conversationQuery([
      {
        conversationId: 'conversation-1',
        title: '转型后的现金流',
        messages: ['root', 'assistant', 'followup'],
      },
    ]),
  );

  const response = await request(
    buildApp({ id: 'user-1', name: '张东', email: 'z@example.com' }),
  ).get('/api/life/bootstrap');

  expect(response.status).toBe(200);
  expect(response.body.recommendedRoute).toBe('/resume');
  expect(response.body.lastConversationId).toBe('conversation-1');
  expect(response.body.summary.lastSurface).toBe('转型后收入不稳定');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/bootstrap', { userId: 'user-1' });
  expect(mockConversationFind).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      spec: 'future-lines',
      isTemporary: { $ne: true },
      'messages.1': { $exists: true },
    }),
  );
});

test('self projection forwards the authenticated user to the read-only Engine view', async () => {
  mockEngine.json.mockResolvedValue({
    schemaVersion: 2,
    projection: { schemaVersion: 2, revision: 'projection_1234567890abcdef1234' },
    availability: { birthDraft: 'not_provided' },
  });

  const response = await request(buildApp({ id: 'user-1' })).get('/api/life/self-projection');

  expect(response.status).toBe(200);
  expect(response.body.availability.birthDraft).toBe('not_provided');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/self-projection', { userId: 'user-1' });
});

test('authenticated bootstrap 读取权威状态失败时返回可重试 503，不推荐首页猜测', async () => {
  mockEngine.json.mockRejectedValueOnce(new Error('engine unavailable'));

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(503);
  expect(response.body).toMatchObject({
    profileState: 'unavailable',
    recommendedRoute: null,
    error: { code: 'PROFILE_UNAVAILABLE', retryable: true },
  });
});

test('authenticated bootstrap restores a two-message conversation whose assistant content is structured', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'ready',
    hasSubstantiveProfile: true,
    summary: {},
  });
  mockConversationFind.mockReturnValue(
    conversationQuery([
      {
        conversationId: 'conversation-two-message',
        title: '刚完成的开场',
        messages: ['root-message', 'assistant-message'],
      },
    ]),
  );
  mockMessageFind.mockReturnValue(
    messageQuery([
      {
        _id: 'assistant-message',
        isCreatedByUser: false,
        error: false,
        unfinished: false,
        text: '',
        content: [{ type: 'text', text: '这是一条完整回答。' }],
      },
    ]),
  );

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(200);
  expect(response.body.lastConversationId).toBe('conversation-two-message');
  expect(mockMessageFind).toHaveBeenCalledWith({ _id: { $in: ['assistant-message'] } });
});

test('authenticated bootstrap restores a two-message conversation whose assistant content is a resource', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'ready',
    hasSubstantiveProfile: true,
    summary: {},
  });
  mockConversationFind.mockReturnValue(
    conversationQuery([
      {
        conversationId: 'conversation-resource-message',
        messages: ['root-message', 'assistant-message'],
      },
    ]),
  );
  mockMessageFind.mockReturnValue(
    messageQuery([
      {
        _id: 'assistant-message',
        isCreatedByUser: false,
        error: false,
        unfinished: false,
        text: '',
        content: [{ type: 'resource', resource: { uri: 'ui://life/report', text: '' } }],
      },
    ]),
  );

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(200);
  expect(response.body.lastConversationId).toBe('conversation-resource-message');
});

test.each([
  ['missing assistant', []],
  [
    'errored assistant',
    [
      {
        _id: 'assistant-message',
        isCreatedByUser: false,
        error: true,
        unfinished: false,
        text: '不应恢复',
      },
    ],
  ],
  [
    'unfinished assistant',
    [
      {
        _id: 'assistant-message',
        isCreatedByUser: false,
        error: false,
        unfinished: true,
        text: '不应恢复',
      },
    ],
  ],
  [
    'empty assistant',
    [
      {
        _id: 'assistant-message',
        isCreatedByUser: false,
        error: false,
        unfinished: false,
        text: '   ',
        content: [],
      },
    ],
  ],
])('resume ignores a two-message placeholder with %s', async (_label, messages) => {
  mockConversationFind.mockReturnValue(
    conversationQuery([
      {
        conversationId: 'conversation-placeholder',
        messages: ['root-message', 'assistant-message'],
      },
    ]),
  );
  mockMessageFind.mockReturnValue(messageQuery(messages));

  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/resume')
    .set('Idempotency-Key', `resume-${_label}`);

  expect(response.status).toBe(200);
  expect(response.body.action).toBe('new');
});

test('bootstrap exposes one verified conversation per life domain', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'ready',
    hasSubstantiveProfile: true,
    activeHouse: 'h6',
    summary: { lifeWheel: { lanternHouse: 'h6' } },
    houseSessions: [
      {
        entryHouse: 'h6',
        sessionId: 'work-conversation',
        stopPoint: { summary: '停在要不要接下这份新工作' },
      },
      {
        entryHouse: 'h2',
        sessionId: 'money-conversation',
        stopPoint: { summary: '停在未来三个月的现金流' },
      },
      { entryHouse: 'h7', sessionId: 'missing-conversation' },
    ],
  });
  mockConversationFind
    .mockReturnValueOnce(
      conversationQuery([
        {
          conversationId: 'money-conversation',
          title: '现金流怎么安排',
          updatedAt: '2026-07-31T10:00:00.000Z',
        },
        {
          conversationId: 'work-conversation',
          title: '新工作的取舍',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
      ]),
    )
    .mockReturnValueOnce(conversationQuery([]));

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(200);
  expect(response.body.lastConversationId).toBe('work-conversation');
  expect(response.body.domainConversations).toEqual([
    {
      entryHouse: 'h6',
      conversationId: 'work-conversation',
      title: '新工作的取舍',
      updatedAt: '2026-08-01T10:00:00.000Z',
      stopPoint: { summary: '停在要不要接下这份新工作' },
    },
    {
      entryHouse: 'h2',
      conversationId: 'money-conversation',
      title: '现金流怎么安排',
      updatedAt: '2026-07-31T10:00:00.000Z',
      stopPoint: { summary: '停在未来三个月的现金流' },
    },
  ]);
});

test('active domain restores by its exact session id even after it falls outside the recent window', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'ready',
    hasSubstantiveProfile: true,
    activeHouse: 'h6',
    summary: { lifeWheel: { lanternHouse: 'h6' } },
    houseSessions: [{ entryHouse: 'h6', sessionId: 'older-work-conversation' }],
  });
  mockConversationFind
    .mockReturnValueOnce(
      conversationQuery([
        { conversationId: 'recent-unmapped-1', title: '最近别的记录' },
        { conversationId: 'recent-unmapped-2', title: '最近别的记录 2' },
      ]),
    )
    .mockReturnValueOnce(
      conversationQuery([{ conversationId: 'older-work-conversation', title: '原来的工作页' }]),
    );

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(200);
  expect(response.body.lastConversationId).toBe('older-work-conversation');
  expect(response.body.domainConversations).toEqual([
    expect.objectContaining({
      entryHouse: 'h6',
      conversationId: 'older-work-conversation',
      title: '原来的工作页',
    }),
  ]);
  expect(response.body.unscopedConversations).toEqual([
    expect.objectContaining({ conversationId: 'recent-unmapped-1' }),
    expect.objectContaining({ conversationId: 'recent-unmapped-2' }),
  ]);
  expect(mockConversationFind).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      user: 'user-1',
      conversationId: { $in: ['older-work-conversation'] },
    }),
  );
});

test('bootstrap exposes saved direct chats instead of dropping conversations without a house session', async () => {
  mockEngine.json.mockResolvedValue({
    profileState: 'empty',
    hasSubstantiveProfile: false,
    houseSessions: [],
  });
  mockConversationFind.mockReturnValue(
    conversationQuery([
      {
        conversationId: 'direct-long-chat',
        title: '刚才聊过的选择',
        updatedAt: '2026-08-09T14:18:06.675Z',
      },
    ]),
  );

  const response = await request(buildApp({ id: 'user-1', name: '张东' })).get(
    '/api/life/bootstrap',
  );

  expect(response.status).toBe(200);
  expect(response.body.domainConversations).toEqual([]);
  expect(response.body.recommendedRoute).toBe('/resume');
  expect(response.body.unscopedConversations).toEqual([
    {
      conversationId: 'direct-long-chat',
      title: '刚才聊过的选择',
      updatedAt: '2026-08-09T14:18:06.675Z',
    },
  ]);
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
  expect(valid.body.action).toBe('new');
  expect(valid.body.conversationId).toBeNull();
  expect(valid.body.entryEvent.entryHouse).toBe('h10');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/bootstrap', { userId: 'user-1' });
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/onboarding',
    expect.objectContaining({ body: { archiveName: '张东', entryHouse: 'h10' } }),
  );
  expect(mockRunLifeOperation).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'domain-page',
      requestPayload: { entryHouse: 'h10' },
      lockScope: 'h10',
      replayWindowMs: 30_000,
    }),
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

test('cached current-house entry restores latest substantive conversation', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockConversationFind.mockReturnValueOnce(
    conversationQuery([{ conversationId: 'conversation-real' }]),
  );
  mockEngine.json
    .mockResolvedValueOnce({
      profileVersion: 'v1',
      activeHouse: 'h6',
      summary: { lifeWheel: { lanternHouse: 'h6' } },
      houseSessions: [{ entryHouse: 'h6', sessionId: 'conversation-real' }],
    })
    .mockResolvedValueOnce({
      ok: true,
      profileVersion: 'v2',
      applied: 0,
      entryEvent: {
        kind: 'house_entered',
        entryHouse: 'h6',
        visitMode: 'continue',
        at: '2026-08-01T00:00:00.000Z',
      },
    });

  const restored = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'cached-current-house')
    .send({
      archiveName: '张东',
      entryHouse: 'h6',
    });

  expect(restored.status).toBe(200);
  expect(restored.body).toMatchObject({
    ok: true,
    action: 'restored',
    conversationId: 'conversation-real',
    route: '/c/conversation-real',
    entryEvent: { kind: 'house_entered', entryHouse: 'h6', visitMode: 'continue' },
  });
  expect(mockRunLifeOperation).not.toHaveBeenCalled();
  expect(mockFinalizeLifeOperationResult).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'domain-page',
      requestPayload: { entryHouse: 'h6' },
      result: expect.objectContaining({ conversationId: 'conversation-real' }),
    }),
  );
  expect(mockEngine.json).toHaveBeenCalledTimes(2);
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/bootstrap', { userId: 'user-1' });
  expect(mockEngine.json).toHaveBeenCalledWith(
    '/internal/onboarding',
    expect.objectContaining({ body: { archiveName: '张东', entryHouse: 'h6' } }),
  );
  expect(mockConversationFind).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      spec: 'future-lines',
      isTemporary: { $ne: true },
      'messages.1': { $exists: true },
    }),
  );
});

test('entering an older domain activates it and restores that domain instead of the latest chat', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockConversationFind.mockReturnValueOnce(
    conversationQuery([
      { conversationId: 'work-conversation', title: '工作' },
      { conversationId: 'money-conversation', title: '财务' },
    ]),
  );
  mockEngine.json
    .mockResolvedValueOnce({
      profileVersion: 'v2',
      activeHouse: 'h6',
      summary: { lifeWheel: { lanternHouse: 'h6' } },
      houseSessions: [
        { entryHouse: 'h6', sessionId: 'work-conversation' },
        { entryHouse: 'h2', sessionId: 'money-conversation' },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      profileVersion: 'v3',
      applied: 0,
      entryEvent: {
        kind: 'house_entered',
        entryHouse: 'h2',
        visitMode: 'continue',
        at: '2026-08-01T01:00:00.000Z',
      },
    });

  const restored = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'restore-money-domain')
    .send({ archiveName: '张东', entryHouse: 'h2' });

  expect(restored.status).toBe(200);
  expect(restored.body).toMatchObject({
    action: 'restored',
    conversationId: 'money-conversation',
    route: '/c/money-conversation',
    entryEvent: { entryHouse: 'h2', visitMode: 'continue' },
  });
});

test('onboarding 在权威 bootstrap 不可用时 fail-closed，不猜领域也不写入', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockEngine.json.mockRejectedValueOnce(new Error('bootstrap unavailable'));

  const response = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'bootstrap-unavailable')
    .send({
      archiveName: '张东',
      entryHouse: 'h6',
    });

  expect(response.status).toBe(503);
  expect(response.body.error).toMatchObject({
    code: 'LIFE_ENGINE_UNAVAILABLE',
    retryable: true,
  });
  expect(mockRunLifeOperation).not.toHaveBeenCalled();
  expect(mockEngine.json).toHaveBeenNthCalledWith(1, '/internal/bootstrap', { userId: 'user-1' });
  expect(mockEngine.json).toHaveBeenCalledTimes(1);
});

test('30 秒 reservation 重放仍逐次执行领域激活，h2→h6→h2 不留下错误 activeHouse', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockRunLifeOperation.mockResolvedValue({
    action: 'new',
    conversationId: null,
    prompt: '[trigger:house_entered]',
    route: '/c/new?q=shared',
    operationId: 'shared-page-reservation',
    replayed: true,
  });
  mockEngine.json.mockImplementation(async (pathname, options) => {
    if (pathname === '/internal/bootstrap') {
      return { activeHouse: options?.body?.entryHouse || null, houseSessions: [] };
    }
    if (pathname === '/internal/onboarding') {
      return {
        ok: true,
        entryEvent: {
          kind: 'house_entered',
          entryHouse: options.body.entryHouse,
          visitMode: 'return_entry',
          at: '2026-08-01T12:00:00.000Z',
        },
      };
    }
    throw new Error(`unexpected path:${pathname}`);
  });

  for (const [index, entryHouse] of ['h2', 'h6', 'h2'].entries()) {
    const response = await request(app)
      .post('/api/life/onboarding')
      .set('Idempotency-Key', `domain-switch-${index}`)
      .send({ archiveName: '同一档案', entryHouse });
    expect(response.status).toBe(200);
    expect(response.body.entryEvent.entryHouse).toBe(entryHouse);
  }

  const activations = mockEngine.json.mock.calls
    .filter(([pathname]) => pathname === '/internal/onboarding')
    .map(([, options]) => options.body.entryHouse);
  expect(activations).toEqual(['h2', 'h6', 'h2']);
  expect(mockRunLifeOperation).toHaveBeenCalledTimes(3);
});

test('同一幂等键改换领域时由 Engine 在激活前拒绝，不留下错误 activeHouse', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  const { LifeEngineError } = require('@librechat/api');
  let receipt = null;
  let activeHouse = null;
  const activationIds = [];
  mockEngine.json.mockImplementation(async (pathname, options) => {
    if (pathname === '/internal/bootstrap') {
      return { activeHouse, houseSessions: [] };
    }
    if (pathname !== '/internal/onboarding') throw new Error(`unexpected path:${pathname}`);
    activationIds.push(options.operation.id);
    if (receipt && receipt.requestHash !== options.operation.requestHash) {
      throw new LifeEngineError(409, 'operation conflict', {
        error: { code: 'LIFE_OPERATION_CONFLICT', retryable: false },
      });
    }
    receipt = options.operation;
    activeHouse = options.body.entryHouse;
    return {
      ok: true,
      entryEvent: {
        kind: 'house_entered',
        entryHouse: activeHouse,
        visitMode: 'first_entry',
        at: '2026-08-01T12:00:00.000Z',
      },
    };
  });

  const first = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'same-domain-key')
    .send({ archiveName: '同一档案', entryHouse: 'h2' });
  const conflict = await request(app)
    .post('/api/life/onboarding')
    .set('Idempotency-Key', 'same-domain-key')
    .send({ archiveName: '同一档案', entryHouse: 'h6' });

  expect(first.status).toBe(200);
  expect(conflict.status).toBe(409);
  expect(conflict.body.error).toMatchObject({ code: 'LIFE_OPERATION_CONFLICT', retryable: false });
  expect(activationIds[0]).toBe(activationIds[1]);
  expect(activeHouse).toBe('h2');
  expect(mockRunLifeOperation).toHaveBeenCalledTimes(1);
});

test('resume restores an existing conversation and only creates D-mode when none exists', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockConversationFind.mockReturnValueOnce(
    conversationQuery([{ conversationId: 'conversation-1' }]),
  );
  const restored = await request(app).post('/api/life/resume').set('Idempotency-Key', 'resume-1');
  expect(restored.body).toEqual({
    action: 'restored',
    conversationId: 'conversation-1',
    route: '/c/conversation-1',
  });

  mockConversationFind.mockReturnValue(conversationQuery([]));
  const created = await request(app).post('/api/life/resume').set('Idempotency-Key', 'resume-2');
  expect(created.body.action).toBe('new');
  expect(decodeURIComponent(created.body.route)).toContain('先读回我的人生存档');
  const resumePrompt = new URL(created.body.route, 'https://yiweilife.test').searchParams.get('q');
  expect(resumePrompt).toContain('[trigger:session_resumed] 我回来了');
  expect(mockRunLifeOperation).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'resume-create', replayWindowMs: 30_000 }),
  );
});

test('resume 在权威 bootstrap 失败时 fail-closed，即使本地最新会话属于另一领域', async () => {
  mockConversationFind.mockReturnValue(
    conversationQuery([{ conversationId: 'stale-money-conversation' }]),
  );
  mockEngine.json.mockRejectedValueOnce(new Error('bootstrap unavailable'));

  const response = await request(buildApp({ id: 'user-1', name: '张东' }))
    .post('/api/life/resume')
    .set('Idempotency-Key', 'resume-bootstrap-down');

  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('LIFE_ENGINE_UNAVAILABLE');
  expect(mockRunLifeOperation).not.toHaveBeenCalled();
});

test('resume follows the active domain and never falls through to another domain', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockConversationFind.mockReturnValueOnce(
    conversationQuery([
      { conversationId: 'money-conversation' },
      { conversationId: 'work-conversation' },
    ]),
  );
  mockEngine.json.mockResolvedValueOnce({
    activeHouse: 'h6',
    summary: { lifeWheel: { lanternHouse: 'h6' } },
    houseSessions: [
      { entryHouse: 'h2', sessionId: 'money-conversation' },
      { entryHouse: 'h6', sessionId: 'work-conversation' },
    ],
  });

  const restored = await request(app)
    .post('/api/life/resume')
    .set('Idempotency-Key', 'resume-active-domain');

  expect(restored.body).toEqual({
    action: 'restored',
    conversationId: 'work-conversation',
    route: '/c/work-conversation',
  });

  jest.clearAllMocks();
  mockConversationFind.mockReturnValue(
    conversationQuery([{ conversationId: 'money-conversation' }]),
  );
  mockRunLifeOperation.mockImplementation(async ({ executor, operation }) => ({
    ...(await executor({
      operationId: `operation-${operation}`,
      requestHash: 'a'.repeat(64),
    })),
    replayed: false,
  }));
  mockEngine.json.mockResolvedValue({
    activeHouse: 'h6',
    summary: { lifeWheel: { lanternHouse: 'h6' } },
    houseSessions: [{ entryHouse: 'h2', sessionId: 'money-conversation' }],
  });

  const missingActive = await request(app)
    .post('/api/life/resume')
    .set('Idempotency-Key', 'resume-missing-active-domain');

  expect(missingActive.body.action).toBe('new');
  expect(missingActive.body.conversationId).toBeNull();
  expect(missingActive.body.route).not.toBe('/c/money-conversation');
  expect(new URL(missingActive.body.route, 'https://yiweilife.test').searchParams.get('q')).toBe(
    '[trigger:house_entered] entryHouse=h6;visitMode=first_entry',
  );
});

test.each([
  {
    label: '聊过但没有停点',
    session: { entryHouse: 'h6', sessionId: 'missing-work-conversation' },
    visitMode: 'return_entry',
  },
  {
    label: '聊过且有停点',
    session: {
      entryHouse: 'h6',
      sessionId: 'missing-work-conversation',
      stopPoint: { summary: '停在要不要接这份新工作' },
    },
    visitMode: 'continue',
  },
])('resume 在活动领域页缺失且$label时重建 canonical 领域页', async ({ session, visitMode }) => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  mockConversationFind.mockReturnValue(conversationQuery([]));
  mockEngine.json.mockResolvedValue({
    activeHouse: 'h6',
    summary: { lifeWheel: { lanternHouse: 'h6' } },
    houseSessions: [session],
  });

  const response = await request(app)
    .post('/api/life/resume')
    .set('Idempotency-Key', `resume-missing-${visitMode}`);

  expect(response.status).toBe(200);
  expect(response.body.action).toBe('new');
  expect(response.body.conversationId).toBeNull();
  expect(new URL(response.body.route, 'https://yiweilife.test').searchParams.get('q')).toBe(
    `[trigger:house_entered] entryHouse=h6;visitMode=${visitMode}`,
  );
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

test('retired inbox API is not registered', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });

  const created = await request(app).post('/api/life/inbox').send({ text: '今天终于推进了一步' });
  const listed = await request(app).get('/api/life/inbox');

  expect(created.status).toBe(404);
  expect(listed.status).toBe(404);
  expect(mockEngine.json).not.toHaveBeenCalled();
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

test('地图状态候选确认走独立幂等操作，不与人物确认或领域批注混写', async () => {
  const app = buildApp({ id: 'user-1', name: '张东' });
  const payload = {
    conversationId: 'conv-linked',
    candidateId: 'condition-candidate-1',
    action: 'confirm',
  };
  const missingKey = await request(app)
    .post('/api/life/map/condition-candidates/resolve')
    .send(payload);
  expect(missingKey.status).toBe(400);

  mockEngine.json.mockResolvedValue({
    ok: true,
    houseKey: 'h6',
    currentLevel: 'strained',
    status: 'user_confirmed',
    trend: 'unknown',
  });
  const response = await request(app)
    .post('/api/life/map/condition-candidates/resolve')
    .set('Idempotency-Key', 'condition-resolution-1')
    .send(payload);
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('user_confirmed');
  expect(mockEngine.json).toHaveBeenCalledWith('/internal/map/condition-candidates/resolve', {
    userId: 'user-1',
    method: 'POST',
    body: payload,
    operation: {
      id: 'operation-house-condition-resolution',
      name: 'house-condition-resolution',
      requestHash: 'a'.repeat(64),
    },
  });
});
