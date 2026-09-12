// Read-only structural identity; no row data or connection values are returned.
const { createHash } = require('crypto');
async function catalogHash(db) {
  const rows = await db.$queryRaw`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name,c.ordinal_position) FROM
        (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length,datetime_precision
         FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations') c),
      'constraints', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name,c.name) FROM
        (SELECT r.relname AS table_name, c.conname AS name, pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname='public' AND r.relname <> '_prisma_migrations') c),
      'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM
        (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') i),
      'enums', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.name,e.position) FROM
        (SELECT t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
         JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') e),
      'functions', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.name,f.definition) FROM
        (SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.prokind='f') f),
      'triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name,t.definition) FROM
        (SELECT t.tgname AS name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
         JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) t)
    ) AS catalog`;
  return createHash('sha256').update(JSON.stringify(rows[0].catalog)).digest('hex');
}
module.exports = { catalogHash };
