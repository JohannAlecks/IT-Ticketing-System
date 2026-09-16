const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { catalogHash } = require('./databaseCatalog');
const MARKER = 'ticketing-system:disposable-integration-tests:v1';
const E2E_MARKER = 'ticketing-system:disposable-e2e-tests:v1';
function profileFor(purpose) {
  if (purpose === 'integration') return { database: 'ticketing_test', url: 'TEST_DATABASE_URL', optIn: 'RUN_DB_TESTS', marker: MARKER };
  if (purpose === 'e2e') return { database: 'ticketing_e2e_test', url: 'E2E_DATABASE_URL', optIn: 'RUN_E2E_TESTS', marker: E2E_MARKER };
  throw refuse('PURPOSE');
}
const refuse = (category) => new Error(`Test database refused: ${category} (connection details redacted)`);
function validateEnvironment(env = process.env, purpose = 'integration') {
  const profile = profileFor(purpose);
  if (env.NODE_ENV !== 'test') throw refuse('NODE_ENV');
  if (env[profile.optIn] !== 'true') throw refuse('OPT_IN');
  let target;
  let database;
  try { target = new URL(env[profile.url]); database = decodeURIComponent(target.pathname.slice(1)); } catch { throw refuse('URL'); }
  if (!['postgresql:', 'postgres:'].includes(target.protocol) || target.hash || database !== profile.database) throw refuse('DATABASE');
  if (target.hostname !== 'localhost' || (target.port || '5432') !== '5432') throw refuse('HOST_PORT');
  if (target.searchParams.get('schema') !== 'public' || target.searchParams.getAll('schema').length !== 1) throw refuse('SCHEMA');
  const allowed = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout']);
  if ([...target.searchParams.keys()].some((key) => !allowed.has(key))) throw refuse('CONNECTION_OPTIONS');
  for (const name of ['DEVELOPMENT_DATABASE_URL', 'PRODUCTION_DATABASE_URL']) {
    if (!env[name]) continue;
    try { if (decodeURIComponent(new URL(env[name]).pathname.slice(1)) === database) throw refuse('NON_TEST_DATABASE'); }
    catch { throw refuse('NON_TEST_DATABASE'); }
  }
  return { database, host: target.hostname, port: 5432, schema: 'public' };
}
function migrationChecksums() {
  const root = path.join(__dirname, '../prisma/migrations');
  return Object.fromEntries(fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) =>
    [d.name, createHash('sha256').update(fs.readFileSync(path.join(root, d.name, 'migration.sql'))).digest('hex')]).sort(([a], [b]) => a.localeCompare(b)));
}
async function verifyDatabase(db, env = process.env, contract = require('./database-contract.json'), purpose = 'integration') {
  const target = validateEnvironment(env, purpose);
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS database, current_schema() AS schema,
      host(inet_server_addr()) AS address, inet_server_port() AS port,
      shobj_description(oid,'pg_database') AS purpose FROM pg_database WHERE datname=current_database()`;
    const row = identity[0];
    if (!row || row.database !== target.database || row.schema !== target.schema || row.port !== 5432 ||
        !['127.0.0.1', '::1'].includes(row.address) || row.purpose !== profileFor(purpose).marker) throw refuse('IDENTITY');
    const expected = migrationChecksums();
    if (JSON.stringify(expected) !== JSON.stringify(contract.migrations)) throw refuse('STALE_SCHEMA_CONTRACT');
    const ledger = await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name`;
    if (ledger.length !== Object.keys(expected).length || ledger.some((m) => !m.finished_at || m.rolled_back_at || m.applied_steps_count !== 1 || expected[m.migration_name] !== m.checksum) || new Set(ledger.map((m) => m.migration_name)).size !== ledger.length) throw refuse('MIGRATIONS');
    if (await catalogHash(db) !== contract.catalogSha256) throw refuse('PHYSICAL_SCHEMA');
    return { ...target, migrations: ledger.length, purposeVerified: true, schemaVerified: true };
  } catch (error) {
    if (error.message?.startsWith('Test database refused:')) throw error;
    throw refuse('IDENTITY_OR_SCHEMA_UNAVAILABLE');
  }
}
module.exports = { MARKER, E2E_MARKER, refuse, validateEnvironment, verifyDatabase, migrationChecksums };
