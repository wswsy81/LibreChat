const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DRAIN_TIMEOUT_MS = 30_000;
const blockedUsers = new Set();
const activeMutations = new Map();
const drainWaiters = new Map();

const isDeletionRetry = (req) =>
  req.method === 'DELETE' && req.baseUrl === '/api/user' && req.path === '/delete';

const userIdFor = (req) => req.user?.id?.toString?.() ?? req.user?._id?.toString?.();

const releaseMutation = (userId) => {
  const remaining = Math.max(0, (activeMutations.get(userId) || 1) - 1);
  if (remaining > 0) {
    activeMutations.set(userId, remaining);
    return;
  }
  activeMutations.delete(userId);
  const waiters = drainWaiters.get(userId);
  if (!waiters) return;
  drainWaiters.delete(userId);
  for (const resolve of waiters) resolve();
};

const trackMutation = (req, res, next, userId) => {
  if (typeof res.once !== 'function') return next();
  activeMutations.set(userId, (activeMutations.get(userId) || 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseMutation(userId);
  };
  res.once('finish', release);
  res.once('close', release);
  return next();
};

const rejectMutation = (res) =>
  res.status(423).json({
    error: {
      code: 'ACCOUNT_DELETION_IN_PROGRESS',
      message: 'Account deletion is in progress. Retry account deletion to finish cleanup.',
    },
  });

const accountDeletionFence = (req, res, next) => {
  if (READ_ONLY_METHODS.has(req.method) || isDeletionRetry(req)) {
    return next();
  }
  const userId = userIdFor(req);
  if (!userId) return next();
  if (req.user?.accountDeletionStartedAt || blockedUsers.has(userId)) {
    blockedUsers.add(userId);
    return rejectMutation(res);
  }
  return trackMutation(req, res, next, userId);
};

accountDeletionFence.beginAccountDeletion = async (userId) => {
  const key = String(userId);
  blockedUsers.add(key);
  if (!activeMutations.get(key)) return;
  await new Promise((resolve, reject) => {
    if (!drainWaiters.has(key)) drainWaiters.set(key, new Set());
    const waiters = drainWaiters.get(key);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      waiters.delete(finish);
      if (waiters.size === 0) drainWaiters.delete(key);
      const error = new Error('Timed out waiting for active account mutations to finish');
      error.code = 'ACCOUNT_DELETION_DRAIN_TIMEOUT';
      reject(error);
    }, DRAIN_TIMEOUT_MS);
    timer.unref?.();
    waiters.add(finish);
  });
};

accountDeletionFence.resetForTests = () => {
  blockedUsers.clear();
  activeMutations.clear();
  drainWaiters.clear();
};

module.exports = accountDeletionFence;
