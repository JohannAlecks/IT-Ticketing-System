const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const guard = serverRequire('./testUtils/databaseGuard');
const { readIdentity } = require('./readiness.cjs');
const { fingerprint } = serverRequire('./testUtils/databaseFingerprint');
const fail = (category) => new Error(`E2E refused: ${category} (details redacted)`);
const API = 'http://127.0.0.1:5410';
const WEB = 'http://127.0.0.1:5411';
function environment(env = process.env) {
  guard.validateEnvironment(env, 'e2e');
  if (env.E2E_APPROVED !== 'true') throw fail('APPROVAL');
  if (env.E2E_API_URL !== API || env.E2E_WEB_URL !== WEB) throw fail('RUNTIME_URL');
  if (!/^[a-f0-9-]{36}$/.test(env.E2E_RUN_ID || '')) throw fail('RUN_ID');
  if (env.EMAIL_PROVIDER !== 'disabled') throw fail('EMAIL');
  return env;
}
async function database(env = process.env) {
  environment(env);
  const { PrismaClient } = serverRequire('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.E2E_DATABASE_URL } }, log: [] });
  try { await guard.verifyDatabase(db, env, undefined, 'e2e'); return db; }
  catch { await db.$disconnect(); throw fail('DATABASE_IDENTITY_SCHEMA'); }
}
function temporaryRoot(root, prefix = 'ticketing-e2e-') {
  const temp = fs.realpathSync(os.tmpdir());
  if (!root || !path.isAbsolute(root) || path.dirname(root) !== temp || !path.basename(root).startsWith(prefix)) throw fail('TEMP_ROOT');
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root) throw fail('TEMP_ROOT');
  return root;
}
async function runtimeIdentity(env = process.env, timeoutMs = 3000) {
  environment(env);
  for (const [url, suffix] of [[API, '/health'], [WEB, '/']]) {
    try { await readIdentity(url + suffix, env.E2E_RUN_ID, { timeoutMs }); }
    catch (error) {
      console.log(JSON.stringify({ status: 'readiness-transport-diagnostic', endpoint: url === API ? 'api' : 'web', category: error.message, phase: error.phase, elapsedMs: error.elapsedMs }));
      throw fail(url === API ? 'API_READINESS' : 'WEB_READINESS');
    }
  }
}
module.exports = { API, WEB, fail, serverRequire, environment, database, fingerprint, temporaryRoot, runtimeIdentity };
