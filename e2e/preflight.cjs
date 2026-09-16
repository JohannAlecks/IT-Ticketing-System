// Read-only approval evidence. Credentials stay in process memory; no env writes.
const fs = require('node:fs'); const path = require('node:path');
const { serverRequire, fingerprint, fail } = require('./safety.cjs');
const guard = serverRequire('./testUtils/databaseGuard');
const { catalogHash } = serverRequire('./testUtils/databaseCatalog');
async function main() {
  const privateConfig = serverRequire('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../server/.env')));
  const url = new URL(process.env.E2E_DEVELOPMENT_DATABASE_URL || privateConfig.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'localhost' || (url.port || '5432') !== '5432' || url.pathname !== '/ticketing_db' || url.searchParams.get('schema') !== 'public' || url.searchParams.getAll('schema').length !== 1 || [...url.searchParams.keys()].some((key) => !['schema', 'connection_limit', 'pool_timeout', 'connect_timeout'].includes(key))) throw fail('PREFLIGHT_TARGET');
  const { PrismaClient } = serverRequire('@prisma/client'); const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const evidence = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [identity] = await tx.$queryRaw`SELECT current_database() AS database, current_schema() AS schema, host(inet_server_addr()) AS address, inet_server_port() AS port`;
      if (identity.database !== 'ticketing_db' || identity.schema !== 'public' || identity.port !== 5432 || !['127.0.0.1', '::1'].includes(identity.address)) throw fail('PREFLIGHT_IDENTITY');
      const checksums = guard.migrationChecksums(); const contract = serverRequire('./testUtils/database-contract.json');
      if (Object.keys(checksums).length !== 18 || JSON.stringify(checksums) !== JSON.stringify(contract.migrations)) throw fail('PREFLIGHT_LOCAL_MIGRATIONS');
      const ledger = await tx.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name`;
      if (ledger.length !== 18 || new Set(ledger.map((m) => m.migration_name)).size !== 18 || ledger.some((m) => !m.finished_at || m.rolled_back_at || m.applied_steps_count !== 1 || checksums[m.migration_name] !== m.checksum)) throw fail('PREFLIGHT_APPLIED_MIGRATIONS');
      if (await catalogHash(tx) !== contract.catalogSha256) throw fail('PREFLIGHT_SCHEMA');
      const databases = await tx.$queryRaw`SELECT datname AS database, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname IN ('ticketing_test', 'ticketing_e2e_test') ORDER BY datname`;
      if (databases.some((row) => row.marker !== (row.database === 'ticketing_test' ? guard.MARKER : guard.E2E_MARKER))) throw fail('PREFLIGHT_PURPOSE');
      return { developmentTarget: { database: 'ticketing_db', host: 'localhost', port: 5432, schema: 'public' },
        migrations: 18, allChecksumsMatch: true, physicalSchemaMatches: true,
        e2eDatabaseExists: databases.some((row) => row.database === 'ticketing_e2e_test'), databases,
        developmentFingerprint: await fingerprint(tx) };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
    console.log(JSON.stringify(evidence, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Read-only E2E preflight refused (details redacted).'); process.exitCode = 1; });
