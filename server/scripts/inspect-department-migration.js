// Read-only approval evidence. Deliberately reports counts and checksums, never
// connection credentials, account details, department values or snapshot text.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs'); const path = require('path'); const { createHash } = require('crypto');
const db = new PrismaClient({ log: [] });
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'localhost' || (url.port || '5432') !== '5432' || url.pathname !== '/ticketing_db' || (url.searchParams.get('schema') || 'public') !== 'public') throw new Error('Unexpected database target');
  const ledger = await db.$queryRaw`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  const directory = path.join(__dirname, '../prisma/migrations');
  const migrations = fs.readdirSync(directory).filter((name) => fs.existsSync(path.join(directory, name, 'migration.sql'))).sort();
  const pending = migrations.filter((name) => !ledger.some((row) => row.migration_name === name));
  const drift = ledger.filter((row) => !migrations.includes(row.migration_name) || createHash('sha256').update(fs.readFileSync(path.join(directory, row.migration_name, 'migration.sql'))).digest('hex') !== row.checksum).map((row) => row.migration_name);
  const values = await db.$queryRaw`
    WITH source AS (SELECT department, regexp_replace(department, '^[[:space:]]+|[[:space:]]+$', '', 'g') AS name FROM users),
    valid AS (SELECT name FROM source WHERE char_length(name) BETWEEN 2 AND 100 AND name !~ '[[:cntrl:]]')
    SELECT (SELECT count(*)::int FROM source) AS users,
      (SELECT count(*)::int FROM source WHERE name IS NULL OR name = '') AS empty,
      (SELECT count(*)::int FROM valid) AS valid,
      (SELECT count(DISTINCT lower(name))::int FROM valid) AS departments,
      (SELECT count(*)::int FROM source WHERE name IS NOT NULL AND name <> '' AND (char_length(name) NOT BETWEEN 2 AND 100 OR name ~ '[[:cntrl:]]')) AS invalid,
      (SELECT count(*)::int FROM (SELECT lower(name) FROM valid GROUP BY lower(name) HAVING count(DISTINCT name) > 1) groups) AS caseVariantGroups`;
  const snapshots = await db.$queryRaw`SELECT count(*)::int AS count, md5(COALESCE(string_agg(id || ':' || COALESCE("departmentSnapshot", '<null>'), '|' ORDER BY id), '')) AS checksum FROM ticket_resolution_cycles`;
  console.log(JSON.stringify({ target: { database: 'ticketing_db', host: 'localhost', port: 5432, schema: 'public' }, applied: ledger.length, local: migrations.length, pending, appliedChecksumMismatches: drift, legacyMapping: values[0], historicalDepartmentSnapshotBaseline: snapshots[0] }, null, 2));
  if (drift.length) process.exitCode = 1;
}
main().catch(() => { console.error('Read-only Department inspection failed (details redacted)'); process.exitCode = 1; }).finally(() => db.$disconnect());
