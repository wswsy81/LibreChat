const express = require('express');
const request = require('supertest');

const mockEngine = { json: jest.fn(), text: jest.fn() };
const mockFindOne = jest.fn();
const mockLogger = { error: jest.fn() };
const mockRunLifeOperation = jest.fn();

class MockLifeEngineError extends Error {
  constructor(status, message, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}
class MockLifeOperationPendingError extends Error {}
class MockLifeOperationConflictError extends Error {
  constructor() {
    super('conflict');
    this.code = 'LIFE_OPERATION_CONFLICT';
  }
}

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createLifeEngineClient: jest.fn(() => mockEngine),
  LifeEngineError: MockLifeEngineError,
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
  lifeShareLimiter: (_req, _res, next) => next(),
}));
jest.mock('~/server/services/lifeOperations', () => ({
  runLifeOperation: (...args) => mockRunLifeOperation(...args),
  LifeOperationPendingError: MockLifeOperationPendingError,
  LifeOperationConflictError: MockLifeOperationConflictError,
}));
jest.mock('~/server/middleware/optionalJwtAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (_req, _res, next) => next());

const lifeRouter = require('./life');

const REPORT_ID = 'report-abc';
const PATH = `/api/life/reports/${REPORT_ID}/stance-feedback`;
const VALID_BODY = {
  reportVersion: 1,
  selection: 'more_direct',
  effectiveLevel: 'direct',
  stancePolicyVersion: 'stance-v1',
};
const ENGINE_RESULT = {
  ok: true,
  reportId: REPORT_ID,
  reportVersion: 1,
  selection: 'more_direct',
  effectiveLevel: 'direct',
  stancePolicyVersion: 'stance-v1',
  recordedAt: '2026-07-26T12:00:00.000Z',
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/life', lifeRouter);
  return app;
}

const post = (body, key = 'idem-key-1') =>
  request(buildApp()).post(PATH).set('Idempotency-Key', key).send(body);

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockReturnValue({
    sort: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
  });
  mockEngine.json.mockResolvedValue(ENGINE_RESULT);
  mockRunLifeOperation.mockImplementation(async ({ executor }) => ({
    ...(await executor({
      operationId: '11111111-1111-4111-8111-111111111111',
      requestHash: 'a'.repeat(64),
    })),
    replayed: false,
  }));
});

test('records the feedback through the canonical five-field engine body', async () => {
  const response = await post(VALID_BODY);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...ENGINE_RESULT, replayed: false });

  const call = mockRunLifeOperation.mock.calls[0][0];
  expect(call.operation).toBe('reveal-stance-feedback');
  expect(call.idempotencyKey).toBe('idem-key-1');
  expect(call.requestPayload).toEqual({ reportId: REPORT_ID, ...VALID_BODY });

  expect(mockEngine.json).toHaveBeenCalledWith(
    `/internal/reports/${REPORT_ID}/stance-feedback`,
    expect.objectContaining({
      userId: 'user-1',
      method: 'POST',
      body: { reportId: REPORT_ID, ...VALID_BODY },
      operation: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'reveal-stance-feedback',
        requestHash: 'a'.repeat(64),
      },
    }),
  );
});

test('hashes the report id so one key cannot replay across two reports', async () => {
  await post(VALID_BODY);
  await request(buildApp())
    .post('/api/life/reports/report-xyz/stance-feedback')
    .set('Idempotency-Key', 'idem-key-1')
    .send(VALID_BODY);

  const [first, second] = mockRunLifeOperation.mock.calls.map(([args]) => args.requestPayload);
  expect(first.reportId).toBe(REPORT_ID);
  expect(second.reportId).toBe('report-xyz');
  expect(first).not.toEqual(second);
});

test('rejects a request without an idempotency key before calling the engine', async () => {
  const response = await request(buildApp()).post(PATH).send(VALID_BODY);

  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  expect(mockRunLifeOperation).not.toHaveBeenCalled();
});

test.each([
  ['unknown selection', { ...VALID_BODY, selection: 'much_more_direct' }],
  ['unknown level', { ...VALID_BODY, effectiveLevel: 'brutal' }],
  ['non integer version', { ...VALID_BODY, reportVersion: 1.5 }],
  ['zero version', { ...VALID_BODY, reportVersion: 0 }],
  ['malformed policy version', { ...VALID_BODY, stancePolicyVersion: 'Stance V1' }],
  ['extra field', { ...VALID_BODY, stancePreference: 'decisive' }],
  ['missing field', { selection: 'just_right', effectiveLevel: 'direct' }],
  ['array body', []],
])('rejects %s with a 422 before calling the engine', async (_label, body) => {
  const response = await post(body);

  expect(response.status).toBe(422);
  expect(response.body.error).toEqual({
    code: 'STANCE_FEEDBACK_INVALID',
    message: expect.any(String),
    retryable: false,
  });
  expect(mockRunLifeOperation).not.toHaveBeenCalled();
});

test('passes engine business rejections through unchanged', async () => {
  mockRunLifeOperation.mockRejectedValue(
    new MockLifeEngineError(409, 'mismatch', {
      error: {
        code: 'REPORT_VERSION_MISMATCH',
        message: '报告版本与反馈请求不一致',
        retryable: false,
      },
    }),
  );

  const response = await post(VALID_BODY);

  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('REPORT_VERSION_MISMATCH');
  expect(response.body.error.retryable).toBe(false);
});

test('maps an idempotency payload conflict to LIFE_OPERATION_CONFLICT', async () => {
  mockRunLifeOperation.mockRejectedValue(new MockLifeOperationConflictError());

  const response = await post(VALID_BODY);

  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('LIFE_OPERATION_CONFLICT');
  expect(response.body.error.retryable).toBe(false);
});

test('maps a still running operation to a retryable pending error', async () => {
  mockRunLifeOperation.mockRejectedValue(new MockLifeOperationPendingError());

  const response = await post(VALID_BODY);

  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('LIFE_OPERATION_PENDING');
  expect(response.body.error.retryable).toBe(true);
});

test('maps an unknown engine failure to a retryable unavailable error', async () => {
  mockRunLifeOperation.mockRejectedValue(new Error('socket hang up'));

  const response = await post(VALID_BODY);

  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('LIFE_ENGINE_UNAVAILABLE');
  expect(response.body.error.retryable).toBe(true);
});

test('replays the stored result without a second engine call', async () => {
  mockRunLifeOperation.mockResolvedValue({ ...ENGINE_RESULT, replayed: true });

  const response = await post(VALID_BODY);

  expect(response.status).toBe(200);
  expect(response.body.replayed).toBe(true);
  expect(mockEngine.json).not.toHaveBeenCalled();
});
