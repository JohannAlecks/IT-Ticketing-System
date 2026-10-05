jest.mock('../../config/env', () => ({ NODE_ENV: 'test' }));

const errorHandler = require('../errorHandler');

test('preserves a safe operational 503 but never its private details or stack', () => {
  const AppError = require('../../utils/AppError');
  const status = jest.fn().mockReturnThis(); const json = jest.fn();
  const error = new AppError('Attachment could not be deleted', 503, { cause: 'private database details' });
  errorHandler(error, { requestId: 'request-1' }, { status, json }, jest.fn());
  expect(status).toHaveBeenCalledWith(503);
  expect(json).toHaveBeenCalledWith({ success: false, message: 'Attachment could not be deleted', requestId: 'request-1' });
});

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
