const env = require('../config/env');

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const event = {
      timestamp: new Date().toISOString(), requestId: req.requestId,
      method: req.method, route: req.route?.path || req.baseUrl || req.path,
      status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id, ip: req.ip,
    };
    if (env.LOG_FORMAT === 'json') console.log(JSON.stringify(event));
    else console.log(`${event.method} ${req.originalUrl} ${event.status} ${event.durationMs}ms req=${event.requestId}${event.userId ? ` user=${event.userId}` : ''}`);
  });
  next();
}

module.exports = requestLogger;
