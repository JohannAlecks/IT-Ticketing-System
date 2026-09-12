// Never import the development .env or inherit its credentials into tests.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));
process.env.DATABASE_URL = process.env.RUN_DB_TESTS === 'true'
  ? (process.env.TEST_DATABASE_URL || '') : 'postgresql://test:test@localhost:1/unit_test?schema=public';
process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
process.env.EMAIL_PROVIDER = 'disabled';
delete process.env.RESEND_API_KEY;
process.env.SLA_SWEEP_QUIET = '1';

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  const state = require('./testUtils/databaseRuntime');
  const { refuse, validateEnvironment } = require('./testUtils/databaseGuard');
  class GuardedPrismaClient extends actual.PrismaClient {
    constructor(options = {}) {
      super({ ...options, datasources: { db: { url: process.env.RUN_DB_TESTS === 'true'
        ? (process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:1/unit_test')
        : 'postgresql://test:test@localhost:1/unit_test' } }, log: [] });
      this.$use((params, next) => {
        validateEnvironment();
        if (!state.verified) throw refuse('GUARD_NOT_VERIFIED');
        return next(params);
      });
    }
    $connect() { validateEnvironment(); if (!state.verified) throw refuse('GUARD_NOT_VERIFIED'); return super.$connect(); }
    $transaction(...args) { validateEnvironment(); if (!state.verified) throw refuse('GUARD_NOT_VERIFIED'); return super.$transaction(...args); }
  }
  return { ...actual, PrismaClient: GuardedPrismaClient };
});

// Local HTTP tests are allowed; provider traffic is never allowed.
const realFetch = global.fetch;
global.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('External test network request blocked');
  return realFetch(input, options);
};
