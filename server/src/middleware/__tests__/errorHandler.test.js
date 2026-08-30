jest.mock('../../config/env', () => ({ NODE_ENV: 'test' }));

const errorHandler = require('../errorHandler');

test('maps Prisma serializable transaction conflicts to a retryable HTTP conflict', () => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();

  errorHandler(
    Object.assign(new Error('Transaction failed'), { code: 'P2034' }),
    { requestId: 'request-1' },
    { status, json },
    jest.fn()
  );

  expect(status).toHaveBeenCalledWith(409);
  expect(json).toHaveBeenCalledWith({
    success: false,
    message: 'This record was changed by another request. Refresh and try again.',
    requestId: 'request-1',
  });
});
