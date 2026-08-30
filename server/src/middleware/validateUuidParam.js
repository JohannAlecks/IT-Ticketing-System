const AppError = require('../utils/AppError');

// A malformed :id / :ticketId / :attachmentId (anything that isn't a UUID)
// would otherwise reach Prisma's findUnique({ where: { id } }) and throw a
// PrismaClientValidationError whose message includes the query, file path,
// and line number — see errorHandler.js for the backstop. This middleware
// stops that at the door with a clean 422 before any DB call happens.
//
// A plain zod `validate(schema, 'params')` doesn't compose cleanly here
// because nested routers (comments/attachments use `mergeParams`) each see
// a different combination of params in `req.params`, so one shared schema
// object would either reject valid combinations or silently strip params
// zod doesn't know about. Validating one param name at a time avoids that.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateUuidParam = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!UUID_RE.test(value)) {
    return next(new AppError(`Invalid ${paramName}`, 422));
  }
  next();
};

module.exports = validateUuidParam;
