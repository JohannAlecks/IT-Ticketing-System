const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
function migrationManifest(root = path.resolve(__dirname, '../../prisma/migrations')) {
  return fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).map(({ name }) => ({
    name, checksum: createHash('sha256').update(fs.readFileSync(path.join(root, name, 'migration.sql'))).digest('hex'),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
function createReadiness(prisma, manifest = migrationManifest()) {
  let draining = false; let pending; let cached = false; let expires = 0;
  async function check() {
    if (draining) return false;
    if (Date.now() < expires) return cached;
    if (!pending) pending = Promise.resolve().then(() => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
      const rows = await tx.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name`;
      return rows.length === manifest.length && manifest.length > 0 && manifest.every((expected, index) => {
        const actual = rows[index];
        return actual.migration_name === expected.name && actual.checksum === expected.checksum && actual.finished_at && !actual.rolled_back_at && actual.applied_steps_count === 1;
      });
    }, { timeout: 3000, maxWait: 2000 })).then(Boolean).catch(() => false).then((ready) => {
      cached = ready; expires = Date.now() + 5000; return ready;
    }).finally(() => { pending = null; });
    return (await pending) && !draining;
  }
  return { check, drain: () => { draining = true; } };
}
module.exports = { migrationManifest, createReadiness };
