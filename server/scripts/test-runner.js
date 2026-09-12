const path = require('path');
const { spawn } = require('child_process');
const suites = require('../testUtils/databaseSuites');
const { validateEnvironment, verifyDatabase } = require('../testUtils/databaseGuard');
const { fingerprint } = require('../testUtils/databaseFingerprint');
const root = path.resolve(__dirname, '..');
function redact(text, env) {
  let safe = text.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]');
  try { const password = decodeURIComponent(new URL(env.TEST_DATABASE_URL).password); if (password) safe = safe.split(password).join('[REDACTED]'); } catch { /* no credentials available */ }
  return safe;
}
async function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const deadline = setTimeout(() => child.kill(), 180000);
    // Redact complete lines so a chunk boundary cannot split a connection URL.
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      let pending = ''; stream.on('data', (chunk) => { pending += chunk.toString(); const parts = pending.split('\n'); pending = parts.pop(); for (const line of parts) output.write(redact(line, env) + '\n'); });
      stream.on('end', () => { if (pending) output.write(redact(pending, env)); });
    }
    child.on('error', () => reject(new Error('Test process could not start (details redacted)')));
    child.on('close', (code) => { clearTimeout(deadline); resolve(code === 0 ? 0 : 1); });
  });
}
async function main() {
  const [mode = 'unit', focus] = process.argv.slice(2);
  if (!['unit', 'db', 'all', 'verify'].includes(mode) || process.argv.length > 4 || (focus && (mode !== 'db' || !suites[focus]))) throw new Error('Invalid test command');
  const env = { ...process.env, NODE_ENV: 'test', RUN_DB_TESTS: mode === 'unit' ? 'false' : 'true', EMAIL_PROVIDER: 'disabled', SLA_SWEEP_QUIET: '1' };
  delete env.DATABASE_URL; delete env.RESEND_API_KEY;
  for (const key of Object.keys(env)) if (/^RUN_.*(?:DB|DATABASE).*TEST|^ALLOW_NON_TEST_DB_INTEGRATION$/.test(key) && key !== 'RUN_DB_TESTS') delete env[key];
  if (mode === 'unit') { process.exitCode = await run(['--testPathIgnorePatterns=integration\\.test\\.js$|ticket\\.integrity\\.db\\.test\\.js$'], env); return; }
  validateEnvironment(env); // Before constructing any database client.
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.TEST_DATABASE_URL } }, log: [] });
  try {
    console.log(JSON.stringify(await verifyDatabase(db, env)));
    // Session advisory lock prevents two controlled test runners overlapping.
    const lock = await db.$queryRaw`SELECT pg_try_advisory_lock(73521, 99) AS acquired`;
    if (!lock[0].acquired) throw new Error('Another database verification is running');
    const baseline = await fingerprint(db);
    const jobs = mode === 'verify'
      ? [...Object.entries(suites).map(([label, file]) => [label, ['--runTestsByPath', file]]), ['combined-1', ['--runTestsByPath', ...Object.values(suites)]], ['combined-2', ['--runTestsByPath', ...Object.values(suites)]], ['full', []]]
      : [[mode, mode === 'db' ? ['--runTestsByPath', ...(focus ? [suites[focus]] : Object.values(suites))] : []]];
    for (const [label, args] of jobs) {
      console.log(`Verification stage: ${label}`);
      const result = await run(args, env);
      const clean = JSON.stringify(await fingerprint(db)) === JSON.stringify(baseline);
      console.log(JSON.stringify({ stage: label, exitCode: result, fixtureBaselineRestored: clean }));
      if (result || !clean) throw new Error('Verification failed or fixture cleanup incomplete; no automatic data deletion attempted');
      await verifyDatabase(db, env);
    }
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('Test verification refused or failed; details redacted. Check the dedicated database, approval, identity marker and migration contract.'); process.exitCode = 1; });
module.exports = { redact, run };
