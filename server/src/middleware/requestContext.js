const crypto = require('crypto');

function requestContext(req, res, next) {
  const suppliedId = req.get('x-request-id');
  req.requestId = suppliedId && /^[a-zA-Z0-9_-]{8,128}$/.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = requestContext;
