const { fork, spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { randomUUID, randomBytes } = require('node:crypto');
const { database, fingerprint, runtimeIdentity, temporaryRoot, serverRequire, API, WEB, fail } = require('./safety.cjs');
const GROUPS = ['auth', 'roles', 'creation', 'lifecycle', 'notifications', 'knowledge', 'sla-csat', 'settings-users', 'departments-email', 'personal-reports'];
function childEnvironment(source, root, run) {
  // Deliberate allowlist; never pass development DATABASE_URL, provider keys,
  // dotenv settings, Node preload flags, or Playwright artifact overrides.
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ComSpec', 'PATHEXT']) if (source[key]) env[key] = source[key];
  return { ...env, NODE_ENV: 'test', RUN_E2E_TESTS: 'true', E2E_APPROVED: source.E2E_APPROVED,
    E2E_DATABASE_URL: source.E2E_DATABASE_URL, E2E_RUN_ID: run, E2E_TEMP_ROOT: root,
    E2E_API_URL: API, E2E_WEB_URL: WEB, EMAIL_PROVIDER: 'disabled', SLA_SWEEP_QUIET: '1',
    JWT_SECRET: randomBytes(32).toString('hex'), CLIENT_URL: WEB, CORS_ORIGINS: WEB,
    AUTH_RATE_LIMIT_MAX: '10', AUTH_RATE_LIMIT_WINDOW_MS: '1000',
    API_RATE_LIMIT_MAX: '120', API_RATE_LIMIT_WINDOW_MS: '1000' };
}
function runtimeWorkingDirectory(kind) { return path.resolve(__dirname, kind === 'web' ? '../client' : '../server'); }
async function ownedRuntime(kind, env, children) {
  // Tailwind resolves the application's content globs from cwd, not Vite root.
  const child = fork(path.join(__dirname, 'runtime.cjs'), [kind], { cwd: runtimeWorkingDirectory(kind), env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  children.push(child);
  child.on('message', (m) => {
    if (m?.failed) console.log(JSON.stringify({ status: 'runtime-child-failure', kind,
      category: /^[A-Z_]+$/.test(m?.category) ? m.category : 'RUNTIME_FAILURE',
      phase: /^[a-z-]+$/.test(m?.phase) ? m.phase : 'unknown',
      frames: Array.isArray(m?.frames) ? m.frames.filter((f) => /^[A-Za-z0-9_.-]+:[0-9]+$/.test(f)) : [] }));
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail('STARTUP_TIMEOUT')), 20000);
    child.once('error', () => { clearTimeout(timer); reject(fail('CHILD_START')); });
    child.once('exit', () => { clearTimeout(timer); reject(fail('CHILD_EXIT')); });
    child.once('message', (m) => {
      clearTimeout(timer);
      if (m?.ready && m.run === env.E2E_RUN_ID) return resolve();
      const category = typeof m?.category === 'string' && /^[A-Z_]+$/.test(m.category) ? m.category : 'CHILD_IDENTITY';
      console.error(JSON.stringify({ category, phase: /^[a-z-]+$/.test(m?.phase) ? m.phase : 'unknown', frames: Array.isArray(m?.frames) ? m.frames.filter((f) => /^[A-Za-z0-9_.-]+:[0-9]+$/.test(f)) : [] }));
      reject(fail(category));
    });
  });
}
async function stopOwned(child, run) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send({ stop: run }); else child.kill();
  });
}
function killOwnedTree(child) {
  if (child.exitCode !== null || child.signalCode !== null || !Number.isInteger(child.pid)) return;
  if (process.platform === 'win32') {
    // Only this runner's still-live Playwright PID and its descendants. Never
    // enumerate/kill processes by executable name or by an occupied port.
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  }
}
async function stage(label, args, env, interrupted) {
  console.log(`E2E stage: ${label}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args], { cwd: __dirname, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const abort = () => killOwnedTree(child);
    interrupted.addEventListener('abort', abort, { once: true });
    if (interrupted.aborted) abort();
    // Only our safe reporter's JSON and static stage messages leave the child.
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; const lines = output.split('\n'); output = lines.pop();
      for (const line of lines) { try { const value = JSON.parse(line); if (typeof value.status === 'string' || Number.isInteger(value.e2eCollected)) console.log(JSON.stringify(value)); } catch { /* no raw logs */ } }
    });
    child.stderr.resume();
    const timeout = setTimeout(abort, 21 * 60 * 1000);
    const finish = (code) => { clearTimeout(timeout); interrupted.removeEventListener('abort', abort); resolve(code === 0 && !interrupted.aborted ? 0 : 1); };
    child.once('error', () => finish(1)); child.once('exit', finish);
  });
}
async function developmentBaseline(source) {
  const url = new URL(source.E2E_DEVELOPMENT_DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || url.hostname !== 'localhost' || (url.port || '5432') !== '5432' || url.pathname !== '/ticketing_db' || url.searchParams.get('schema') !== 'public' || url.searchParams.getAll('schema').length !== 1 || [...url.searchParams.keys()].some((key) => !['schema', 'connection_limit', 'pool_timeout', 'connect_timeout'].includes(key))) throw fail('DEVELOPMENT_READ_ONLY_TARGET');
  const { PrismaClient } = serverRequire('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try { return await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [identity] = await tx.$queryRaw`SELECT current_database() AS database, current_schema() AS schema, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    if (identity.database !== 'ticketing_db' || identity.schema !== 'public' || identity.port !== 5432 || !['127.0.0.1', '::1'].includes(identity.address)) throw fail('DEVELOPMENT_READ_ONLY_IDENTITY');
    return fingerprint(tx);
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 }); }
  finally { await db.$disconnect(); }
}
async function main() {
  const startedAt = Date.now();
  const [mode = 'full', group] = process.argv.slice(2);
  if (!['full', 'smoke', 'group', 'headed', 'repeat', 'verify', 'runtime'].includes(mode) || (mode === 'group' ? !GROUPS.includes(group) : group)) throw fail('COMMAND');
  // Validate before allocating directories, starting services, or writing fixtures.
  const run = randomUUID(); const env = childEnvironment(process.env, '', run);
  const db = await database(env); const children = []; let root; let before; let dev;
  const interrupted = new AbortController(); const interrupt = () => interrupted.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    const lock = await db.$queryRaw`SELECT pg_try_advisory_lock(73521, 100) AS acquired`;
    if (!lock[0].acquired) throw fail('CONCURRENT_E2E');
    before = await fingerprint(db); dev = await developmentBaseline(process.env);
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-e2e-'));
    env.E2E_TEMP_ROOT = root;
    await ownedRuntime('api', env, children); await ownedRuntime('web', env, children);
    // Initial Vite HTML transformation can outlast a warm health check on
    // Windows. This waits once for readiness; fixture checks remain at 3s.
    await runtimeIdentity(env, 15000);
    console.log(JSON.stringify({ status: 'runtime-verified', runId: run, api: API, web: WEB, purpose: 'e2e', fixtureFingerprint: before, developmentFingerprint: dev }));
    if (interrupted.signal.aborted) throw fail('INTERRUPTED');
    const jobs = mode === 'runtime' ? [] : mode === 'verify' ? [...GROUPS.map((g) => [g, [g + '.spec.cjs']]), ['full-1', []], ['full-2', []]]
      : mode === 'repeat' ? [['full-1', []], ['full-2', []]]
      : [[mode, mode === 'group' ? [group + '.spec.cjs'] : mode === 'smoke' ? ['--grep', '@smoke'] : mode === 'headed' ? ['--headed'] : []]];
    for (const [label, args] of jobs) {
      if (interrupted.signal.aborted) throw fail('INTERRUPTED');
      const stageStartedAt = Date.now();
      const result = await stage(label, args, env, interrupted.signal);
      const clean = JSON.stringify(await fingerprint(db)) === JSON.stringify(before);
      const developmentUnchanged = JSON.stringify(await developmentBaseline(process.env)) === JSON.stringify(dev);
      console.log(JSON.stringify({ stage: label, runId: run, durationMs: Date.now() - stageStartedAt, exitCode: result, fixtureBaselineRestored: clean, developmentUnchanged }));
      if (result || !clean || !developmentUnchanged) throw fail('VERIFICATION_OR_CLEANUP');
      await serverRequire('./testUtils/databaseGuard').verifyDatabase(db, env, undefined, 'e2e');
    }
  } finally {
    await Promise.all(children.map((child) => stopOwned(child, run)));
    let fixtureBaselineRestored = null; let developmentUnchanged = null;
    try {
      if (before) { fixtureBaselineRestored = JSON.stringify(await fingerprint(db)) === JSON.stringify(before); if (!fixtureBaselineRestored) process.exitCode = 1; }
      if (dev) { developmentUnchanged = JSON.stringify(await developmentBaseline(process.env)) === JSON.stringify(dev); if (!developmentUnchanged) process.exitCode = 1; }
    } finally {
      await db.$disconnect();
      if (root) { temporaryRoot(root); fs.rmSync(root, { recursive: true }); }
      console.log(JSON.stringify({ status: 'runtime-cleanup', runId: run, durationMs: Date.now() - startedAt, fixtureBaselineRestored, developmentUnchanged,
        temporaryRootRemoved: Boolean(root) && !fs.existsSync(root), ownedProcessesStopped: children.every((child) => child.exitCode !== null || child.signalCode !== null) }));
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    }
  }
}
if (require.main === module) main().catch((error) => { const category = /^E2E refused: ([A-Z_]+) /.exec(error.message || '')?.[1] || 'UNCLASSIFIED'; console.error(`E2E refused or failed: ${category}. Details suppressed; no automatic database purge performed.`); process.exitCode = 1; });
module.exports = { childEnvironment, GROUPS, developmentBaseline, runtimeWorkingDirectory };
