const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');

const { LIFE_SHARE_IP_WINDOW = 1, LIFE_SHARE_IP_MAX = 20 } = process.env;
const windowMs = LIFE_SHARE_IP_WINDOW * 60 * 1000;
const max = LIFE_SHARE_IP_MAX;
const windowInMinutes = windowMs / 60000;

const handler = (_req, res) => {
  return res.status(429).json({
    error: {
      code: 'SHARE_READ_RATE_LIMITED',
      message: `分享读取过于频繁，请 ${windowInMinutes} 分钟后再试`,
      retryable: true,
    },
  });
};

const lifeShareLimiter = rateLimit({
  windowMs,
  max,
  handler,
  keyGenerator: (req) => ipKeyGenerator(removePorts(req)),
  store: limiterCache('life_share_limiter'),
});

module.exports = lifeShareLimiter;
