const { createHash } = require('crypto');
async function fingerprint(db) {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const rows = [];
  for (const { tablename } of tables) {
    const table = `"public"."${tablename.replace(/"/g, '""')}"`;
    // Identifier comes only from PostgreSQL's catalog, never CLI/user input.
    const result = await db.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(value, '' ORDER BY value), '')) AS checksum FROM (SELECT to_jsonb(t)::text AS value FROM ${table} t) rows`);
    rows.push({ table: tablename, ...result[0] });
  }
  return { tables: rows.length, digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}
module.exports = { fingerprint };
