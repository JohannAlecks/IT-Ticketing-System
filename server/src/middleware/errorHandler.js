const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  if (err.code === 'P2002') {
    statusCode = 409;
    message = `Duplicate value for field: ${err.meta?.target?.join(', ') || 'unknown'}`;
  }
  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  }
  if (err.code === 'P2034') {
    statusCode = 409;
    message = 'This record was changed by another request. Refresh and try again.';
  }
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }
  // express.json()'s body-parser throws these for oversized or malformed
  // request bodies — without this, they fell through to the generic 500
  // branch below (and could leak a raw body-parser message/stack in dev).
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON in request body';
  }
  // Prisma's own validation errors (e.g. a malformed UUID reaching a
  // findUnique({ where: { id } }) call) include the query, file path, and
  // line number in their message. That message was being sent to the
  // client verbatim regardless of NODE_ENV — this replaces it with a safe,
  // generic message. Proper UUID validation on route params (see
  // ticket.routes.js / attachment.routes.js) should catch this earlier in
  // practice; this is the backstop for anywhere that doesn't.
  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid request data';
  }

  if (env.NODE_ENV === 'development' && statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.requestId,
    ...(details && { details }),
    ...(env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  });
}

module.exports = errorHandler;
