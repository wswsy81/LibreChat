const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 15 * 1000;
const POLL_INTERVAL_MS = 250;
const POLL_ATTEMPTS = 10;

const operationSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    operation: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
operationSchema.index({ user: 1, operation: 1, idempotencyKey: 1 }, { unique: true });
operationSchema.index({ user: 1, operation: 1, createdAt: -1 });
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLock(key, ownerRequestId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_MS);
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

async function findReplayable({ userId, operation, idempotencyKey, replayWindowMs }) {
  const byKey = await LifeOperation.findOne({ user: userId, operation, idempotencyKey }).lean();
  if (byKey) {
    return byKey.result;
  }
  if (!replayWindowMs) {
    return null;
  }
  const latest = await LifeOperation.findOne({
    user: userId,
    operation,
    createdAt: { $gte: new Date(Date.now() - replayWindowMs) },
  })
    .sort({ createdAt: -1 })
    .lean();
  return latest ? latest.result : null;
}

/**
 * Runs a life-design write exactly once per user gesture.
 *
 * Idempotency-Key replays the stored result; a per-user lease lock serializes
 * concurrent requests (tabs/devices with different keys); `replayWindowMs`
 * additionally replays the latest completed operation of the same type across
 * keys, so competing tabs converge on one result instead of duplicating it.
 * `persistIf` lets read-only outcomes (e.g. "restored") skip persistence.
 */
async function runLifeOperation({
  userId,
  operation,
  idempotencyKey,
  replayWindowMs = 0,
  persistIf,
  executor,
  attempt = 0,
}) {
  const replayable = await findReplayable({ userId, operation, idempotencyKey, replayWindowMs });
  if (replayable) {
    return { ...replayable, replayed: true };
  }

  const requestId = randomUUID();
  const lockKey = `life:${operation}:${userId}`;
  const acquired = await acquireLock(lockKey, requestId);
  if (!acquired) {
    for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
      await sleep(POLL_INTERVAL_MS);
      const settled = await findReplayable({
        userId,
        operation,
        idempotencyKey,
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
        replayWindowMs,
        persistIf,
        executor,
        attempt: attempt + 1,
      });
    }
    throw new LifeOperationPendingError(operation);
  }

  try {
    const settled = await findReplayable({ userId, operation, idempotencyKey, replayWindowMs });
    if (settled) {
      return { ...settled, replayed: true };
    }
    const result = await executor();
    if (persistIf == null || persistIf(result)) {
      await LifeOperation.create({
        user: userId,
        operation,
        idempotencyKey,
        result,
        expiresAt: new Date(Date.now() + DAY_MS),
      });
    }
    return { ...result, replayed: false };
  } finally {
    await releaseLock(lockKey, requestId);
  }
}

module.exports = { runLifeOperation, LifeOperationPendingError, LifeOperation, LifeLock };
