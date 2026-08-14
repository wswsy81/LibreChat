const { randomUUID } = require('crypto');

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const LOCAL_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_REPLAY_WINDOW_MS = 30_000;
const MAX_LOCAL_CONVERSATIONS = 200;
const localOperations = new Map();
const localOperationWindows = new Map();
let localEngineClient;

function csvSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function localDataBetaEnabled() {
  return ENABLED_VALUES.has(
    String(process.env.FUTURE_LINES_LOCAL_DATA_BETA_ENABLED || '').toLowerCase(),
  );
}

function normalizedUserIdentity(user) {
  return {
    id: String(user?.id || user?._id || '')
      .trim()
      .toLowerCase(),
    email: String(user?.email || '')
      .trim()
      .toLowerCase(),
  };
}

function isLocalDataBetaUser(user) {
  if (!localDataBetaEnabled()) return false;
  const identity = normalizedUserIdentity(user);
  const ids = csvSet(process.env.FUTURE_LINES_LOCAL_DATA_BETA_USER_IDS);
  const emails = csvSet(process.env.FUTURE_LINES_LOCAL_DATA_BETA_EMAILS);
  return Boolean(
    (identity.id && ids.has(identity.id)) || (identity.email && emails.has(identity.email)),
  );
}

function isLocalDataRequest(req) {
  return isLocalDataBetaUser(req?.user);
}

function localDataUnavailable(res, message = '设备本地模式不支持此操作') {
  return res.status(409).json({
    error: { code: 'LOCAL_DATA_OPERATION_UNAVAILABLE', message },
  });
}

function blockLocalDataPersistence(req, res, next) {
  if (isLocalDataBetaUser(req?.user)) return localDataUnavailable(res);
  return next();
}

function getLocalEngineClient() {
  if (!localEngineClient) {
    const { createLifeEngineClient } = require('@librechat/api');
    localEngineClient = createLifeEngineClient({
      baseUrl: process.env.FUTURE_ENGINE_URL || 'http://future-engine:8899',
      token: process.env.FUTURE_ENGINE_INTERNAL_TOKEN || 'future-lines-local-internal',
      identitySecret: process.env.FUTURE_ENGINE_IDENTITY_SECRET || '',
    });
  }
  return localEngineClient;
}

async function requireLocalDataSession(req, res, next) {
  if (!isLocalDataBetaUser(req?.user)) return next();
  try {
    await getLocalEngineClient().json('/internal/local-data/session', {
      userId: normalizedUserIdentity(req.user).id,
    });
    return next();
  } catch (error) {
    return res.status(409).json({
      error: {
        code: 'LOCAL_DATA_SESSION_REQUIRED',
        message: '这台设备的本地数据会话已过期，请刷新页面后继续。',
        retryable: true,
      },
    });
  }
}

function localConversationSummaries(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value.slice(0, MAX_LOCAL_CONVERSATIONS)) {
    const conversationId = String(item?.conversationId || '').trim();
    if (!conversationId || conversationId.length > 128 || seen.has(conversationId)) continue;
    seen.add(conversationId);
    const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 1024) : null;
    const updatedAtValue = typeof item?.updatedAt === 'string' ? item.updatedAt : '';
    const updatedAt = Number.isNaN(Date.parse(updatedAtValue)) ? null : updatedAtValue;
    result.push({ conversationId, title: title || null, updatedAt });
  }
  return result;
}

function pruneLocalOperations(now = Date.now()) {
  for (const [key, row] of localOperations) {
    if (now - row.createdAt > LOCAL_OPERATION_TTL_MS) localOperations.delete(key);
  }
  for (const [key, row] of localOperationWindows) {
    if (now - row.createdAt > LOCAL_OPERATION_TTL_MS) localOperationWindows.delete(key);
  }
}

async function runLocalDataOperation({
  userId,
  operation,
  idempotencyKey,
  requestHash,
  replayWindowMs = 0,
  executor,
}) {
  pruneLocalOperations();
  const key = `${userId}\u0000${operation}\u0000${idempotencyKey}`;
  const windowKey = `${userId}\u0000${operation}\u0000${requestHash}`;
  const existing = localOperations.get(key);
  if (existing?.requestHash && existing.requestHash !== requestHash) {
    const error = new Error(`idempotency key payload conflict: ${operation}`);
    error.code = 'LIFE_OPERATION_CONFLICT';
    throw error;
  }
  if (existing) {
    const result = await existing.promise;
    return { ...result, replayed: true };
  }
  const recent = localOperationWindows.get(windowKey);
  if (replayWindowMs && recent && Date.now() - recent.createdAt <= replayWindowMs) {
    const result = await recent.promise;
    return { ...result, replayed: true };
  }
  const operationId = randomUUID();
  const row = {
    operationId,
    requestHash,
    createdAt: Date.now(),
    promise: null,
  };
  row.promise = Promise.resolve()
    .then(() => executor({ operationId, requestHash }))
    .catch((error) => {
      localOperations.delete(key);
      if (localOperationWindows.get(windowKey) === row) localOperationWindows.delete(windowKey);
      throw error;
    });
  localOperations.set(key, row);
  localOperationWindows.set(windowKey, row);
  const result = await row.promise;
  return { ...result, replayed: false };
}

function resetLocalDataOperationStateForTests() {
  localOperations.clear();
  localOperationWindows.clear();
}

function dataStorageForUser(user) {
  const device = isLocalDataBetaUser(user);
  return {
    mode: device ? 'device' : 'server',
    backupEnabled: false,
    canEnableBackup: false,
    notice: device
      ? '数据只保存在这台设备的未来线本地空间。主动清除未来线本地数据后，将无法恢复。'
      : null,
  };
}

module.exports = {
  blockLocalDataPersistence,
  dataStorageForUser,
  isLocalDataBetaUser,
  isLocalDataRequest,
  localConversationSummaries,
  localDataUnavailable,
  localDataBetaEnabled,
  requireLocalDataSession,
  resetLocalDataOperationStateForTests,
  runLocalDataOperation,
  LOCAL_REPLAY_WINDOW_MS,
};
