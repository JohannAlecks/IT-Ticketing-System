const AppError = require('../utils/AppError');

function createRateLimit({ windowMs, max, keyGenerator = (req) => req.ip }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req) || req.ip;
    const record = hits.get(key);
    const current = !record || now >= record.resetAt ? { count: 0, resetAt: now + windowMs } : record;
    current.count += 1;
    hits.set(key, current);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - current.count));
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return next(new AppError('Too many requests. Please try again later.', 429));
    }
    next();
  };
}

module.exports = createRateLimit;
