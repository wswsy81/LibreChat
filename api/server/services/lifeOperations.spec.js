const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mockDeleteLifeAccountData = jest.fn();

jest.mock('@librechat/api', () => ({
  deleteLifeAccountData: (...args) => mockDeleteLifeAccountData(...args),
  // 2026-07-27:租约与轮询从写死改成运行策略配置(runtime policy)。
  // 这里复刻 runtimeConfig.ts 的默认值:并发用例依赖真实轮询节奏,调快会把
  // 「等锁持有者结算」测成 PENDING。测的是并发/幂等语义,不测配置加载。
  runtimeApiPolicy: () => ({
    operationLeaseMs: 15_000,
    operationPollIntervalMs: 250,
    operationPollAttempts: 10,
  }),
}));

const {
  runLifeOperation,
  LifeOperationPendingError,
  LifeOperation,
  LifeLock,
  deleteLifeAccount,
  deleteLifeOperationState,
} = require('./lifeOperations');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await LifeOperation.syncIndexes();
  await LifeLock.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockDeleteLifeAccountData.mockResolvedValue({
    deletionId: 'del_test',
    status: 'completed',
  });
  await LifeOperation.deleteMany({});
  await LifeLock.deleteMany({});
});

describe('runLifeOperation', () => {
  it('replays the stored result for the same idempotency key', async () => {
    const executor = jest.fn().mockResolvedValue({ route: '/c/new?q=x' });
    const base = { userId: 'u1', operation: 'onboarding', idempotencyKey: 'k1', executor };

    const first = await runLifeOperation(base);
    const second = await runLifeOperation(base);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ route: '/c/new?q=x', replayed: false });
    expect(second).toEqual({ route: '/c/new?q=x', replayed: true });
  });

  it('replays across different keys within the replay window', async () => {
    const executor = jest.fn().mockResolvedValue({ action: 'new', operationId: 'op-1' });
    const windowMs = 10 * 60 * 1000;

    const first = await runLifeOperation({
      userId: 'u1',
      operation: 'resume-create',
      idempotencyKey: 'tab-a',
      replayWindowMs: windowMs,
      executor,
    });
    const second = await runLifeOperation({
      userId: 'u1',
      operation: 'resume-create',
      idempotencyKey: 'tab-b',
      replayWindowMs: windowMs,
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(second.operationId).toBe(first.operationId);
    expect(second.replayed).toBe(true);
  });

  it('does not replay across keys without a replay window', async () => {
    let calls = 0;
    const executor = jest.fn().mockImplementation(async () => ({ snapshot: (calls += 1) }));

    await runLifeOperation({
      userId: 'u1',
      operation: 'blood-bars',
      idempotencyKey: 'a',
      executor,
    });
    const second = await runLifeOperation({
      userId: 'u1',
      operation: 'blood-bars',
      idempotencyKey: 'b',
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(second.snapshot).toBe(2);
  });

  it('keeps same-key recovery but excludes persistIf=false results from cross-key replay', async () => {
    const executor = jest.fn().mockResolvedValue({ action: 'restored' });

    await runLifeOperation({
      userId: 'u1',
      operation: 'resume-create',
      idempotencyKey: 'k1',
      requestPayload: { action: 'resume-create' },
      replayWindowMs: 10 * 60 * 1000,
      persistIf: (result) => result.action === 'new',
      executor,
    });
    await runLifeOperation({
      userId: 'u1',
      operation: 'resume-create',
      idempotencyKey: 'k2',
      requestPayload: { action: 'resume-create' },
      replayWindowMs: 10 * 60 * 1000,
      persistIf: (result) => result.action === 'new',
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(await LifeOperation.countDocuments({ status: 'completed' })).toBe(2);
  });

  it('does not persist a failed execution, allowing retry with the same key', async () => {
    const executor = jest
      .fn()
      .mockRejectedValueOnce(new Error('engine down'))
      .mockResolvedValueOnce({ ok: true });
    const base = { userId: 'u1', operation: 'onboarding', idempotencyKey: 'k1', executor };

    await expect(runLifeOperation(base)).rejects.toThrow('engine down');
    const retried = await runLifeOperation(base);

    expect(retried).toEqual({ ok: true, replayed: false });
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('reuses one stable operation id when the engine committed but the Mongo receipt failed', async () => {
    const committed = new Map();
    const preparedStates = [];
    let sideEffects = 0;
    const executor = jest.fn(async (context = {}) => {
      preparedStates.push(
        await LifeOperation.findOne({
          user: 'u1',
          operation: 'blood-bars',
          idempotencyKey: 'k1',
        }).lean(),
      );
      const operationId = context.operationId || `legacy-${executor.mock.calls.length}`;
      const known = committed.get(operationId);
      if (known) {
        if (known.requestHash !== context.requestHash) {
          const conflict = new Error('operation payload conflict');
          conflict.code = 'LIFE_OPERATION_CONFLICT';
          throw conflict;
        }
        return known.result;
      }
      sideEffects += 1;
      const result = { snapshot: sideEffects };
      committed.set(operationId, { requestHash: context.requestHash, result });
      return result;
    });

    const originalCreate = LifeOperation.create.bind(LifeOperation);
    const originalFindOneAndUpdate = LifeOperation.findOneAndUpdate.bind(LifeOperation);
    let failCompletion = true;
    const createSpy = jest.spyOn(LifeOperation, 'create').mockImplementation(async (document) => {
      if (document?.result && failCompletion) {
        failCompletion = false;
        throw new Error('Mongo receipt write failed');
      }
      return originalCreate(document);
    });
    const updateSpy = jest
      .spyOn(LifeOperation, 'findOneAndUpdate')
      .mockImplementation(async (filter, update, options) => {
        if (update?.$set?.status === 'completed' && failCompletion) {
          failCompletion = false;
          throw new Error('Mongo receipt write failed');
        }
        return originalFindOneAndUpdate(filter, update, options);
      });

    const request = {
      userId: 'u1',
      operation: 'blood-bars',
      idempotencyKey: 'k1',
      requestPayload: { dashboards: { health: 5, work: 4, play: 3, love: 2 } },
      executor,
    };

    try {
      await expect(runLifeOperation(request)).rejects.toThrow('Mongo receipt write failed');
      const retried = await runLifeOperation(request);

      expect(sideEffects).toBe(1);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(preparedStates).toHaveLength(2);
      expect(preparedStates.every((row) => row?.status === 'prepared')).toBe(true);
      expect(preparedStates[0].operationId).toBe(executor.mock.calls[0][0].operationId);
      expect(executor.mock.calls[0][0].operationId).toBe(executor.mock.calls[1][0].operationId);
      expect(retried).toEqual({ snapshot: 1, replayed: false });
    } finally {
      createSpy.mockRestore();
      updateSpy.mockRestore();
    }
  });

  it('rejects one idempotency key reused with a different payload', async () => {
    const executor = jest.fn().mockResolvedValue({ ok: true });
    const base = {
      userId: 'u1',
      operation: 'basics-save',
      idempotencyKey: 'k1',
      executor,
    };

    await runLifeOperation({ ...base, requestPayload: { nickname: '甲' } });
    await expect(
      runLifeOperation({ ...base, requestPayload: { nickname: '乙' } }),
    ).rejects.toMatchObject({ code: 'LIFE_OPERATION_CONFLICT' });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent tabs with different keys onto one result', async () => {
    let calls = 0;
    const executor = jest.fn().mockImplementation(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { action: 'new', operationId: `op-${calls}` };
    });
    const windowMs = 10 * 60 * 1000;
    const run = (key) =>
      runLifeOperation({
        userId: 'u1',
        operation: 'resume-create',
        idempotencyKey: key,
        replayWindowMs: windowMs,
        executor,
      });

    const [a, b] = await Promise.all([run('tab-a'), run('tab-b')]);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(a.operationId).toBe('op-1');
    expect(b.operationId).toBe('op-1');
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });

  it('throws LIFE_OPERATION_PENDING when the lock holder never settles', async () => {
    await LifeLock.create({
      key: 'life:onboarding:u1',
      ownerRequestId: 'other',
      fence: 1,
      expiresAt: new Date(Date.now() + 60 * 1000),
    });
    const executor = jest.fn();

    await expect(
      runLifeOperation({ userId: 'u1', operation: 'onboarding', idempotencyKey: 'k1', executor }),
    ).rejects.toThrow(LifeOperationPendingError);
    expect(executor).not.toHaveBeenCalled();
  }, 15000);

  it('prepares a stable account deletion task before calling future-engine and can retry it', async () => {
    mockDeleteLifeAccountData
      .mockRejectedValueOnce(new Error('engine unavailable'))
      .mockResolvedValueOnce({ deletionId: 'del_test', status: 'completed' });

    await expect(deleteLifeAccount('u1')).rejects.toThrow('engine unavailable');
    const prepared = await LifeOperation.findOne({
      user: 'u1',
      operation: 'account-delete',
    }).lean();
    expect(prepared).toMatchObject({ status: 'prepared', idempotencyKey: 'account-delete-v1' });

    const result = await deleteLifeAccount('u1');
    expect(result).toMatchObject({ deletionId: 'del_test', status: 'completed', replayed: false });
    expect(mockDeleteLifeAccountData).toHaveBeenCalledTimes(2);
    expect(mockDeleteLifeAccountData.mock.calls[0][0].operationId).toBe(
      mockDeleteLifeAccountData.mock.calls[1][0].operationId,
    );
    expect(mockDeleteLifeAccountData.mock.calls[0][0].requestHash).toBe(
      mockDeleteLifeAccountData.mock.calls[1][0].requestHash,
    );
  });

  it('keeps the account deletion operation prepared when LibreChat cleanup fails and retries all cleanup', async () => {
    const cleanup = jest
      .fn()
      .mockRejectedValueOnce(new Error('local cleanup failed'))
      .mockResolvedValueOnce(undefined);

    await expect(deleteLifeAccount('u1', cleanup)).rejects.toThrow('local cleanup failed');
    expect(
      await LifeOperation.findOne({ user: 'u1', operation: 'account-delete' }).lean(),
    ).toMatchObject({ status: 'prepared' });

    const result = await deleteLifeAccount('u1', cleanup);
    expect(result).toMatchObject({ deletionId: 'del_test', status: 'completed' });
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(mockDeleteLifeAccountData).toHaveBeenCalledTimes(2);
    expect(mockDeleteLifeAccountData.mock.calls[0][0].operationId).toBe(
      mockDeleteLifeAccountData.mock.calls[1][0].operationId,
    );
  });

  it('removes account deletion receipts and stale per-user life locks before deleting the user row', async () => {
    await deleteLifeAccount('u1');
    await LifeLock.create({
      key: 'life:basics-save:u1',
      ownerRequestId: 'stale',
      fence: 1,
      expiresAt: new Date(Date.now() - 1000),
    });

    const deleted = await deleteLifeOperationState('u1');

    expect(deleted).toEqual({ operations: 1, locks: 1 });
    expect(await LifeOperation.countDocuments({ user: 'u1' })).toBe(0);
    expect(await LifeLock.countDocuments({ key: /u1$/ })).toBe(0);

    await deleteLifeAccount('u1');
    expect(mockDeleteLifeAccountData).toHaveBeenCalledTimes(2);
    expect(mockDeleteLifeAccountData.mock.calls[0][0].requestHash).toBe(
      mockDeleteLifeAccountData.mock.calls[1][0].requestHash,
    );
    expect(mockDeleteLifeAccountData.mock.calls[0][0].operationId).not.toBe(
      mockDeleteLifeAccountData.mock.calls[1][0].operationId,
    );
  });
});
