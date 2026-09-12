jest.mock('./databaseCatalog', () => ({ catalogHash: jest.fn() }));
const { validateEnvironment, verifyDatabase, migrationChecksums, MARKER } = require('./databaseGuard');
const { catalogHash } = require('./databaseCatalog');
const { redact } = require('../scripts/test-runner');
const contract = require('./database-contract.json');
const safe = () => ({ NODE_ENV: 'test', RUN_DB_TESTS: 'true', TEST_DATABASE_URL: 'postgresql://test:synthetic-password@localhost:5432/ticketing_test?schema=public' });
const identity = { database: 'ticketing_test', address: '127.0.0.1', port: 5432, schema: 'public', purpose: MARKER };
function database() {
  return { $queryRaw: jest.fn().mockResolvedValueOnce([identity]).mockResolvedValueOnce(Object.entries(migrationChecksums()).map(([migration_name, checksum]) => ({ migration_name, checksum, finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 }))) };
}
beforeEach(() => { jest.clearAllMocks(); catalogHash.mockResolvedValue(contract.catalogSha256); });
test.each(['ticketing_db', 'production_test', 'staging_test', 'dev_test', 'test', 'ticketing_test_copy'])('rejects database %s without making a query', async (databaseName) => {
  const env = safe(); env.TEST_DATABASE_URL = env.TEST_DATABASE_URL.replace('/ticketing_test?', `/${databaseName}?`); const db = database();
  await expect(verifyDatabase(db, env)).rejects.toThrow('Test database refused'); expect(db.$queryRaw).not.toHaveBeenCalled();
});
test.each([{ NODE_ENV: 'development' }, { NODE_ENV: 'production' }, { RUN_DB_TESTS: undefined }, { TEST_DATABASE_URL: undefined }, { TEST_DATABASE_URL: 'not a connection URL' }, { TEST_DATABASE_URL: 'postgresql://test:unused@remote.invalid:5432/ticketing_test?schema=public' }, { TEST_DATABASE_URL: 'postgresql://test:unused@localhost:5433/ticketing_test?schema=public' }, { TEST_DATABASE_URL: 'postgresql://test:unused@localhost:5432/ticketing_test?schema=other' }, { TEST_DATABASE_URL: 'postgresql://test:unused@localhost:5432/ticketing_test?schema=public&schema=other' }, { TEST_DATABASE_URL: 'postgresql://test:unused@localhost:5432/ticketing_test?schema=public&host=remote.invalid' }])('fails closed on invalid environment %#', (overrides) => {
  expect(() => validateEnvironment({ ...safe(), ...overrides })).toThrow('Test database refused');
});
test('rejects configured non-test database aliases', () => {
  expect(() => validateEnvironment({ ...safe(), DEVELOPMENT_DATABASE_URL: safe().TEST_DATABASE_URL })).toThrow('NON_TEST_DATABASE');
  expect(() => validateEnvironment({ ...safe(), PRODUCTION_DATABASE_URL: safe().TEST_DATABASE_URL })).toThrow('NON_TEST_DATABASE');
});
test('valid dedicated identity, purpose, complete ledger and physical schema pass', async () => {
  const db = database();
  await expect(verifyDatabase(db, safe())).resolves.toMatchObject({ database: 'ticketing_test', migrations: 18, schemaVerified: true });
  expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('host(inet_server_addr())');
});
test.each([{ database: 'ticketing_db' }, { purpose: null }, { address: '10.0.0.2' }, { schema: 'other' }, { port: 5444 }])('server identity mismatch aborts %#', async (overrides) => {
  await expect(verifyDatabase({ $queryRaw: jest.fn().mockResolvedValue([{ ...identity, ...overrides }]) }, safe())).rejects.toThrow('IDENTITY');
});
test('missing, drifted and failed migrations reject', async () => {
  for (const ledger of [[], [{ migration_name: 'unrelated', checksum: 'bad', finished_at: new Date(), applied_steps_count: 1 }]]) {
    const db = { $queryRaw: jest.fn().mockResolvedValueOnce([identity]).mockResolvedValueOnce(ledger) };
    await expect(verifyDatabase(db, safe())).rejects.toThrow('MIGRATIONS');
  }
  await expect(verifyDatabase(database(), safe(), { ...contract, migrations: {} })).rejects.toThrow('STALE_SCHEMA_CONTRACT');
});
test('physical constraint/index/function drift rejects even with matching migration ledger', async () => {
  catalogHash.mockResolvedValue('changed'); await expect(verifyDatabase(database(), safe())).rejects.toThrow('PHYSICAL_SCHEMA');
});
test('connection failures and runner output never expose supplied credentials', async () => {
  const db = { $queryRaw: jest.fn().mockRejectedValue(new Error(safe().TEST_DATABASE_URL)) };
  const error = await verifyDatabase(db, safe()).catch((e) => e);
  expect(error.message).not.toMatch(/synthetic-password|postgresql:\/\//);
  expect(redact(`failure ${safe().TEST_DATABASE_URL} synthetic-password`, safe())).not.toMatch(/synthetic-password|postgresql:\/\//);
});
test('real client mutation/connect/transaction is blocked before verification without network activity', async () => {
  const { PrismaClient } = require('@prisma/client'); const db = new PrismaClient();
  expect(() => db.$connect()).toThrow('Test database refused');
  expect(() => db.$transaction(() => {})).toThrow('Test database refused');
  await expect(db.user.deleteMany({})).rejects.toThrow('Test database refused');
  await db.$disconnect();
});

test('direct shortcut constraint recognizes only the exact verified Prisma wrapper', () => {
  const { isNamedCheck } = require('./constraintFailure');
  const error = { code: 'P2010', meta: { code: '23514', message: 'ERROR: Shortcut position must be between 0 and 7 at commit' } };
  expect(isNamedCheck(error, 'user_shortcuts_committed_position')).toBe(true);
  expect(isNamedCheck(error, 'unrelated_check')).toBe(false);
  for (const other of [{ ...error, code: 'P2002' }, { ...error, meta: { ...error.meta, code: '23503' } },
    { ...error, meta: { ...error.meta, message: 'unrelated check failure' } }, new Error('connection failed')]) {
    expect(isNamedCheck(other, 'user_shortcuts_committed_position')).toBe(false);
  }
});
