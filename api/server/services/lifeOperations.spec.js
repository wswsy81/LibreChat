const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  runLifeOperation,
  LifeOperationPendingError,
  LifeOperation,
  LifeLock,
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

  it('skips persistence when persistIf returns false', async () => {
    const executor = jest.fn().mockResolvedValue({ action: 'restored' });

    await runLifeOperation({
      userId: 'u1',
      operation: 'resume-create',
      idempotencyKey: 'k1',
      persistIf: (result) => result.action === 'new',
      executor,
    });

    expect(await LifeOperation.countDocuments({})).toBe(0);
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
});
