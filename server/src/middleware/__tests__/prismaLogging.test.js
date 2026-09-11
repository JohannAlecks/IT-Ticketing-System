jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn() }));
jest.mock('../../config/env', () => ({ NODE_ENV: 'development' }));
test('Prisma logs retain a signal without exposing raw event messages or query values', () => {
  const { PrismaClient } = require('@prisma/client'); const handlers = {};
  PrismaClient.mockImplementation(() => ({ $on: (level, fn) => { handlers[level] = fn; } }));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {}); const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    require('../../config/prisma');
    handlers.error({ message: 'private search text', query: 'private SQL' }); handlers.warn({ message: 'private search text' });
    expect(error).toHaveBeenCalledWith('Database operation failed (details redacted)');
    expect(warn).toHaveBeenCalledWith('Database warning (details redacted)');
  } finally { error.mockRestore(); warn.mockRestore(); }
});
