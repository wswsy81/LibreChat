const mongoose = require('mongoose');
const { createHash, randomUUID } = require('crypto');
const { deleteLifeAccountData, runtimeApiPolicy } = require('@librechat/api');

const DAY_MS = 24 * 60 * 60 * 1000;

const operationSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    operation: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    operationId: { type: String },
    requestHash: { type: String },
    status: { type: String, enum: ['prepared', 'completed'] },
    result: { type: mongoose.Schema.Types.Mixed },
    replayAcrossKeys: { type: Boolean },
    completedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
operationSchema.index({ user: 1, operation: 1, idempotencyKey: 1 }, { unique: true });
operationSchema.index({ user: 1, operation: 1, createdAt: -1 });
operationSchema.index({ user: 1, operation: 1, requestHash: 1, createdAt: -1 });
operationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const lockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  ownerRequestId: { type: String, required: true },
  fence: { type: Number, default: 1 },
  expiresAt: { type: Date, required: true },
});

const LifeOperation =
  mongoose.models.LifeOperation || mongoose.model('LifeOperation', operationSchema);
const LifeLock = mongoose.models.LifeLock || mongoose.model('LifeLock', lockSchema);

class LifeOperationPendingError extends Error {
  constructor(operation) {
    super(`life operation pending: ${operation}`);
    this.name = 'LifeOperationPendingError';
  }
}

class LifeOperationConflictError extends Error {
  constructor(operation) {
    super(`idempotency key payload conflict: ${operation}`);
    this.name = 'LifeOperationConflictError';
    this.code = 'LIFE_OPERATION_CONFLICT';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLock(key, ownerRequestId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + runtimeApiPolicy().operationLeaseMs);
  const taken = await LifeLock.findOneAndUpdate(
    { key, expiresAt: { $lte: now } },
    { $set: { ownerRequestId, expiresAt }, $inc: { fence: 1 } },
    { new: true },
  ).lean();
  if (taken) {
    return true;
  }
  try {
    await LifeLock.create({ key, ownerRequestId, fence: 1, expiresAt });
    return true;
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
}

async function releaseLock(key, ownerRequestId) {
  await LifeLock.deleteOne({ key, ownerRequestId });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function hashLifeOperationPayload(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function isCompleted(row) {
  return Boolean(row && (row.status === 'completed' || (!row.status && row.result !== undefined)));
}

function assertMatchingRequest(row, requestHash, operation) {
  if (row?.requestHash && row.requestHash !== requestHash) {
    throw new LifeOperationConflictError(operation);
  }
}

async function findByKey({ userId, operation, idempotencyKey }) {
  return LifeOperation.findOne({ user: userId, operation, idempotencyKey }).lean();
}

async function findWindowCandidate({ userId, operation, requestHash, replayWindowMs }) {
  if (!replayWindowMs) return null;
  return LifeOperation.findOne({
    user: userId,
    operation,
    requestHash,
    createdAt: { $gte: new Date(Date.now() - replayWindowMs) },
    $or: [{ status: 'prepared' }, { status: 'completed', replayAcrossKeys: true }],
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function completedReplay({ userId, operation, idempotencyKey, requestHash, replayWindowMs }) {
  const byKey = await findByKey({ userId, operation, idempotencyKey });
  if (byKey) {
    assertMatchingRequest(byKey, requestHash, operation);
    if (isCompleted(byKey)) return byKey.result;
    return null;
  }
  const latest = await findWindowCandidate({ userId, operation, requestHash, replayWindowMs });
  return latest && isCompleted(latest) ? latest.result : null;
}

/**
 * Runs a life-design write exactly once per user gesture.
 *
 * Mongo first persists a stable operationId + requestHash before calling the
 * executor. The executor must pass that identity to future-engine, which stores
 * its result receipt in the same atomic commit as the profile mutation. If the
 * engine succeeds but Mongo completion fails, a retry reuses the same operationId
 * and the engine replays without repeating the side effect.
 */
async function runLifeOperation({
  userId,
  operation,
  idempotencyKey,
  requestPayload = null,
  replayWindowMs = 0,
  persistIf,
  executor,
  lockScope = null,
  attempt = 0,
}) {
  const requestHash = hashLifeOperationPayload(requestPayload);
  const replayable = await completedReplay({
    userId,
    operation,
    idempotencyKey,
    requestHash,
    replayWindowMs,
  });
  if (replayable) {
    return { ...replayable, replayed: true };
  }

  const requestId = randomUUID();
  const lockSuffix =
    lockScope == null ? '' : `:${hashLifeOperationPayload(lockScope).slice(0, 16)}`;
  const lockKey = `life:${operation}:${userId}${lockSuffix}`;
  const acquired = await acquireLock(lockKey, requestId);
  if (!acquired) {
    const policy = runtimeApiPolicy();
    for (let i = 0; i < policy.operationPollAttempts; i += 1) {
      await sleep(policy.operationPollIntervalMs);
      const settled = await completedReplay({
        userId,
        operation,
        idempotencyKey,
        requestHash,
        replayWindowMs: replayWindowMs || DAY_MS,
      });
      if (settled) {
        return { ...settled, replayed: true };
      }
    }
    if (attempt < 1) {
      return runLifeOperation({
        userId,
        operation,
        idempotencyKey,
        requestPayload,
        replayWindowMs,
        persistIf,
        executor,
        lockScope,
        attempt: attempt + 1,
      });
    }
    throw new LifeOperationPendingError(operation);
  }

  try {
    const settled = await completedReplay({
      userId,
      operation,
      idempotencyKey,
      requestHash,
      replayWindowMs,
    });
    if (settled) {
      return { ...settled, replayed: true };
    }

    let prepared = await findByKey({ userId, operation, idempotencyKey });
    if (prepared) {
      assertMatchingRequest(prepared, requestHash, operation);
    } else {
      const candidate = await findWindowCandidate({
        userId,
        operation,
        requestHash,
        replayWindowMs,
      });
      const operationId = candidate?.operationId || randomUUID();
      try {
        const created = await LifeOperation.create({
          user: userId,
          operation,
          idempotencyKey,
          operationId,
          requestHash,
          status: 'prepared',
          expiresAt: new Date(Date.now() + DAY_MS),
        });
        prepared = created.toObject();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        prepared = await findByKey({ userId, operation, idempotencyKey });
        assertMatchingRequest(prepared, requestHash, operation);
      }
    }

    if (isCompleted(prepared)) {
      return { ...prepared.result, replayed: true };
    }
    if (!prepared?.operationId) {
      throw new LifeOperationPendingError(operation);
    }

    const result = await executor({ operationId: prepared.operationId, requestHash });
    const replayAcrossKeys = persistIf == null || persistIf(result);
    const completed = await LifeOperation.findOneAndUpdate(
      { _id: prepared._id, status: 'prepared', operationId: prepared.operationId, requestHash },
      {
        $set: {
          status: 'completed',
          result,
          replayAcrossKeys,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      },
      { new: true },
    );
    if (!completed) {
      const known = await findByKey({ userId, operation, idempotencyKey });
      assertMatchingRequest(known, requestHash, operation);
      if (isCompleted(known)) {
        return { ...known.result, replayed: true };
      }
      throw new LifeOperationPendingError(operation);
    }
    return { ...result, replayed: false };
  } finally {
    await releaseLock(lockKey, requestId);
  }
}

async function finalizeLifeOperationResult({
  userId,
  operation,
  requestPayload = null,
  result,
  replayWindowMs = DAY_MS,
}) {
  const requestHash = hashLifeOperationPayload(requestPayload);
  const updated = await LifeOperation.updateMany(
    {
      user: userId,
      operation,
      requestHash,
      status: { $in: ['prepared', 'completed'] },
      createdAt: { $gte: new Date(Date.now() - replayWindowMs) },
    },
    {
      $set: {
        status: 'completed',
        result,
        replayAcrossKeys: true,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    },
  );
  return { updated: updated.modifiedCount || 0 };
}

async function deleteLifeAccount(userId, deleteLibreChatData = async () => {}) {
  return runLifeOperation({
    userId,
    operation: 'account-delete',
    idempotencyKey: 'account-delete-v1',
    requestPayload: { schemaVersion: 1 },
    executor: async ({ operationId, requestHash }) => {
      const engineDeletion = await deleteLifeAccountData({
        userId,
        operationId,
        requestHash,
      });
      await deleteLibreChatData(engineDeletion);
      return engineDeletion;
    },
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function deleteLifeOperationState(userId) {
  const [operations, locks] = await Promise.all([
    LifeOperation.deleteMany({ user: userId }),
    LifeLock.deleteMany({ key: { $regex: `^life:.*:${escapeRegex(userId)}(?::.*)?$` } }),
  ]);
  return {
    operations: operations.deletedCount || 0,
    locks: locks.deletedCount || 0,
  };
}

module.exports = {
  runLifeOperation,
  LifeOperationPendingError,
  LifeOperationConflictError,
  LifeOperation,
  LifeLock,
  hashLifeOperationPayload,
  finalizeLifeOperationResult,
  deleteLifeAccount,
  deleteLifeOperationState,
};
