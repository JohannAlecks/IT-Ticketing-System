const AppError = require('../utils/AppError');

const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(new AppError('Validation failed', 422, details));
  }

  req[source] = result.data;
  next();
};

module.exports = validate;
