const { registerSchema, loginSchema, resendVerificationSchema } = require('../auth.schema');
const createRateLimit = require('../../../middleware/rateLimit');

test.each([registerSchema, loginSchema, resendVerificationSchema])('normalizes email input before auth handling', (schema) => {
  const input = schema === registerSchema
    ? { name: 'Uma User', email: '  UMA@Example.Test  ', password: 'password123' }
    : schema === loginSchema
      ? { email: '  UMA@Example.Test  ', password: 'password123' }
      : { email: '  UMA@Example.Test  ' };
  expect(schema.parse(input).email).toBe('uma@example.test');
});

test('normalized resend identity values share one rate-limit bucket', () => {
  const limiter = createRateLimit({ windowMs: 60_000, max: 1, keyGenerator: (req) => `resend-verification:${req.body.email}` });
  const res = { setHeader: jest.fn() };
  const next = jest.fn();
  limiter({ ip: '127.0.0.1', body: resendVerificationSchema.parse({ email: ' UMA@Example.Test ' }) }, res, next);
  limiter({ ip: '127.0.0.2', body: resendVerificationSchema.parse({ email: 'uma@example.test' }) }, res, next);
  expect(next).toHaveBeenNthCalledWith(1);
  expect(next).toHaveBeenNthCalledWith(2, expect.objectContaining({ statusCode: 429 }));
});
