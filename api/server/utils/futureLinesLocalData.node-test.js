const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLocalDataBetaUser,
  isLocalDataRequest,
  localConversationSummaries,
  resetLocalDataOperationStateForTests,
  runLocalDataOperation,
} = require('./futureLinesLocalData');

const originalEnv = {
  enabled: process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED,
  ids: process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS,
  emails: process.env.FUTURE_LINES_LOCAL_DATA_BETA_EMAILS,
};

test.beforeEach(() => {
  resetLocalDataOperationStateForTests();
  process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED = 'true';
  process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS = 'User-1';
  process.env.FUTURE_LINES_LOCAL_DATA_BETA_EMAILS = 'beta@example.com';
});

test.after(() => {
  for (const [name, value] of Object.entries({
    FUTURE_LINES_LOCAL_DATA_BETA_ENABLED: originalEnv.enabled,
    FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS: originalEnv.ids,
    FUTURE_LINES_LOCAL_DATA_BETA_EMAILS: originalEnv.emails,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('server whitelist is authoritative for device mode', () => {
  assert.equal(isLocalDataBetaUser({ id: 'user-1' }), true);
  assert.equal(isLocalDataBetaUser({ email: 'BETA@example.com' }), true);
  assert.equal(isLocalDataRequest({ user: { id: 'user-1' }, body: {} }), true);
  assert.equal(
    isLocalDataRequest({ user: { id: 'ordinary' }, body: { dataStorageMode: 'device' } }),
    false,
  );
});

test('conversation summaries are bounded and deduplicated', () => {
  assert.deepEqual(
    localConversationSummaries([
      { conversationId: 'c1', title: ' title ', updatedAt: '2026-08-14T00:00:00.000Z' },
      { conversationId: 'c1', title: 'duplicate' },
      { conversationId: '', title: 'invalid' },
    ]),
    [{ conversationId: 'c1', title: 'title', updatedAt: '2026-08-14T00:00:00.000Z' }],
  );
});

test('local operations replay without a persistent store', async () => {
  let calls = 0;
  const executor = async ({ operationId }) => {
    calls += 1;
    return { operationId, ok: true };
  };
  const args = {
    userId: 'user-1',
    operation: 'basics-save',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    replayWindowMs: 30_000,
    executor,
  };

  const first = await runLocalDataOperation(args);
  const sameKey = await runLocalDataOperation(args);
  const replayWindow = await runLocalDataOperation({ ...args, idempotencyKey: 'key-2' });

  assert.equal(calls, 1);
  assert.equal(first.replayed, false);
  assert.deepEqual(sameKey, { ...first, replayed: true });
  assert.deepEqual(replayWindow, { ...first, replayed: true });
});

test('one idempotency key cannot be reused with another payload', async () => {
  await runLocalDataOperation({
    userId: 'user-1',
    operation: 'birth-save',
    idempotencyKey: 'same-key',
    requestHash: 'hash-1',
    executor: async () => ({ ok: true }),
  });

  await assert.rejects(
    runLocalDataOperation({
      userId: 'user-1',
      operation: 'birth-save',
      idempotencyKey: 'same-key',
      requestHash: 'hash-2',
      executor: async () => ({ ok: true }),
    }),
    (error) => error.code === 'LIFE_OPERATION_CONFLICT',
  );
});
