const { createHash } = require('crypto');
const { logger } = require('@librechat/data-schemas');

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const LOCAL_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_REPLAY_WINDOW_MS = 30_000;
const MAX_LOCAL_CONVERSATIONS = 200;
const localOperations = new Map();
const localOperationWindows = new Map();
const knownLocalDataUserIds = new Set();
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
  const enabled = Boolean(
    (identity.id && ids.has(identity.id)) || (identity.email && emails.has(identity.email)),
  );
  if (enabled && identity.id) knownLocalDataUserIds.add(identity.id);
  return enabled;
}

function isKnownLocalDataUserId(userId) {
  return knownLocalDataUserIds.has(
    String(userId || '')
      .trim()
      .toLowerCase(),
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
  if (!isLocalDataBetaUser(req?.user)) {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      delete req.body.localDataSessionId;
    }
    return next();
  }
  const expectedSessionId = String(req.get('X-Future-Lines-Local-Session') || '').trim();
  if (!expectedSessionId) {
    return res.status(409).json({
      error: {
        code: 'LOCAL_DATA_SESSION_REQUIRED',
        message: '这台设备的本地数据会话尚未准备好，请刷新页面后继续。',
        retryable: true,
      },
    });
  }
  try {
    const session = await getLocalEngineClient().json('/internal/local-data/session', {
      userId: normalizedUserIdentity(req.user).id,
    });
    if (session?.sessionId !== expectedSessionId) {
      return res.status(409).json({
        error: {
          code: 'LOCAL_DATA_SESSION_REPLACED',
          message: '这台设备的数据会话已在另一个页面更新，请刷新后继续。',
          retryable: true,
        },
      });
    }
    req.localDataSessionId = expectedSessionId;
    return next();
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 0);
    logger.error('[local-data] session verification failed', {
      status,
      message: error?.message,
    });
    if (status === 401 || status === 403) {
      return res.status(502).json({
        error: {
          code: 'LOCAL_DATA_ENGINE_IDENTITY_REJECTED',
          message: '本地数据引擎身份校验失败，请稍后重试。',
          retryable: true,
        },
      });
    }
    if (status !== 409) {
      return res.status(503).json({
        error: {
          code: 'LOCAL_DATA_ENGINE_UNAVAILABLE',
          message: '本地数据引擎暂时不可用，请稍后重试。',
          retryable: true,
        },
      });
    }
    return res.status(409).json({
      error: {
        code: 'LOCAL_DATA_SESSION_REQUIRED',
        message: '这台设备的本地数据会话已过期，请刷新页面后继续。',
        retryable: true,
      },
    });
  }
}

function deterministicOperationId(parts) {
  const hex = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
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
  sessionId,
  operation,
  idempotencyKey,
  requestHash,
  replayWindowMs = 0,
  executor,
}) {
  pruneLocalOperations();
  const scope = `${userId}\u0000${sessionId || 'no-session'}`;
  const key = `${scope}\u0000${operation}\u0000${idempotencyKey}`;
  const windowKey = `${scope}\u0000${operation}\u0000${requestHash}`;
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
  const operationId = deterministicOperationId([
    'local-life-operation',
    userId,
    sessionId || null,
    operation,
    idempotencyKey,
  ]);
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

function clearLocalDataOperationsForUser(userId) {
  const prefix = `${String(userId || '')}\u0000`;
  for (const key of localOperations.keys()) {
    if (key.startsWith(prefix)) localOperations.delete(key);
  }
  for (const key of localOperationWindows.keys()) {
    if (key.startsWith(prefix)) localOperationWindows.delete(key);
  }
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
  isKnownLocalDataUserId,
  localConversationSummaries,
  localDataUnavailable,
  localDataBetaEnabled,
  requireLocalDataSession,
  resetLocalDataOperationStateForTests,
  clearLocalDataOperationsForUser,
  runLocalDataOperation,
  LOCAL_REPLAY_WINDOW_MS,
};
