const { fork, spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { emit } = require('./evidence.cjs');
const { createOwnedRoot, removeOwnedRoot, waitForExit, ownedProcessesGone } = require('./cleanup.cjs');
const { failureState, failureError, cleanupStep, decode } = require('./failure.cjs');
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
  const started = Date.now();
  // Tailwind resolves the application's content globs from cwd, not Vite root.
  const child = fork(path.join(__dirname, 'runtime.cjs'), [kind], { cwd: runtimeWorkingDirectory(kind), env, execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  children.push(child);
  const stderrCategories = new Set();
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    for (const code of ['EACCES', 'EPERM', 'EADDRINUSE']) if (text.includes(code)) stderrCategories.add(code);
    if (/deprecat/i.test(text)) stderrCategories.add('DEPRECATION');
  });
  child.once('close', (exitCode) => { child.ownedClosed = true; emit(env.E2E_RUN_ID, { status: 'owned-process-exit', kind, exitCode, stderrCategories: [...stderrCategories] }); });
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
      if (m?.ready && m.run === env.E2E_RUN_ID) {
        emit(env.E2E_RUN_ID, { status: 'runtime-ready', kind, durationMs: Date.now() - started, port: kind === 'api' ? 5410 : 5411, runIdentityMatches: true });
        return resolve();
      }
      const category = typeof m?.category === 'string' && /^[A-Z_]+$/.test(m.category) ? m.category : 'CHILD_IDENTITY';
      console.error(JSON.stringify({ category, phase: /^[a-z-]+$/.test(m?.phase) ? m.phase : 'unknown', frames: Array.isArray(m?.frames) ? m.frames.filter((f) => /^[A-Za-z0-9_.-]+:[0-9]+$/.test(f)) : [] }));
      reject(fail(category));
    });
  });
}
async function stopOwned(child, run) {
  if (child.ownedClosed) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); }, 5000);
    const deadline = setTimeout(() => { clearTimeout(timer); reject(fail('OWNED_PROCESS_EXIT_TIMEOUT')); }, 10000);
    child.once('close', () => { clearTimeout(timer); clearTimeout(deadline); resolve(); });
    if (child.connected) child.send({ stop: run });
    else if (child.exitCode === null && child.signalCode === null) child.kill();
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
    let output = ''; let firstFailure;
    child.stdout.on('data', (chunk) => { output += chunk; const lines = output.split('\n'); output = lines.pop();
      for (const line of lines) { try {
        const value = JSON.parse(line);
        if (!firstFailure && value.status === 'browser-failure') firstFailure = decode(failureError(value));
        if (!firstFailure && ['failed', 'timedOut'].includes(value.status) && value.failures?.length) {
          firstFailure = decode(failureError(value.failures[0])) || { primary: { phase: 'assertion', category: 'ASSERTION_FAILED' }, secondary: [] };
        }
        if (typeof value.status === 'string' || Number.isInteger(value.e2eCollected)) console.log(JSON.stringify(value));
      } catch { /* no raw logs */ } }
    });
    child.stderr.resume();
    const timeout = setTimeout(abort, 21 * 60 * 1000);
    const finish = (code) => { clearTimeout(timeout); interrupted.removeEventListener('abort', abort); resolve({ exitCode: code === 0 && !interrupted.aborted ? 0 : 1, firstFailure }); };
    // close, unlike exit, waits for reporter stdout/stderr handles to close.
    child.once('error', () => {}); child.once('close', finish);
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
  if (!['full', 'smoke', 'group', 'headed', 'repeat', 'verify', 'runtime', 'diagnostic', 'branding', 'a11y', 'a11y-baseline', 'a11y-keyboard', 'a11y-compat'].includes(mode) || (mode === 'group' ? !GROUPS.includes(group) : group)) throw fail('COMMAND');
  // Validate before allocating directories, starting services, or writing fixtures.
  const run = randomUUID(); const env = childEnvironment(process.env, '', run);
  if (mode.startsWith('a11y') || mode === 'branding') { env.E2E_A11Y = 'true'; env.A11Y_BASELINE = String(mode === 'a11y-baseline'); }
  const db = await database(env); const children = []; let root; let ownedRoot; let before; let dev;
  const failures = { primary: null, secondary: [] };
  const interrupted = new AbortController(); const interrupt = () => interrupted.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    const lock = await db.$queryRaw`SELECT pg_try_advisory_lock(73521, 100) AS acquired`;
    if (!lock[0].acquired) throw fail('CONCURRENT_E2E');
    before = await fingerprint(db); dev = await developmentBaseline(process.env);
    ownedRoot = createOwnedRoot(); root = ownedRoot.directory;
    env.E2E_TEMP_ROOT = root;
    await ownedRuntime('api', env, children); await ownedRuntime('web', env, children);
    // Initial Vite HTML transformation can outlast a warm health check on
    // Windows. This waits once for readiness; fixture checks remain at 3s.
    const readinessStarted = Date.now(); await runtimeIdentity(env, 15000);
    emit(run, { status: 'http-ready', durationMs: Date.now() - readinessStarted, apiStatus: 200, webStatus: 200, runIdentityMatches: true });
    emit(run, { status: 'runtime-verified', runId: run, api: API, web: WEB, purpose: 'e2e', fixtureFingerprint: before, developmentFingerprint: dev });
    if (interrupted.signal.aborted) throw fail('INTERRUPTED');
    if (mode === 'diagnostic') {
      const previous = { ...process.env };
      try {
        Object.assign(process.env, env);
        await require('./browser-fixture.cjs').withIsolatedBrowser(async (browser) => {
          try { const context = await browser.newContext(); const page = await context.newPage(); await page.goto('about:blank'); }
          catch (error) { throw failureError(failureState(error, 'context')); }
        }, { project: { use: { channel: 'chrome', headless: true } }, record: (row) => emit(run, row) });
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
        Object.assign(process.env, previous);
      }
    }
    const jobs = ['runtime', 'diagnostic'].includes(mode) ? [] : mode === 'branding' ? [['branding', ['auth.spec.cjs', 'compatibility.spec.cjs']]] : mode === 'verify' ? [...GROUPS.map((g) => [g, [g + '.spec.cjs']]), ['full-1', []], ['full-2', []]]
      : mode === 'repeat' ? [['full-1', []], ['full-2', []]]
      : [[mode, mode.startsWith('a11y') ? [mode === 'a11y-compat' ? 'compatibility.spec.cjs' : 'accessibility.spec.cjs', ...(mode === 'a11y-baseline' ? ['--max-failures=0'] : mode === 'a11y-keyboard' ? ['--grep', 'keyboard '] : [])] : mode === 'group' ? [group + '.spec.cjs'] : mode === 'smoke' ? ['--grep', '@smoke'] : mode === 'headed' ? ['--headed'] : []]];
    for (const [label, args] of jobs) {
      if (interrupted.signal.aborted) throw fail('INTERRUPTED');
      const stageStartedAt = Date.now();
      const result = await stage(label, args, env, interrupted.signal);
      if (result.exitCode) {
        emit(run, { stage: label, runId: run, durationMs: Date.now() - stageStartedAt, exitCode: result.exitCode });
        throw result.firstFailure ? failureError(result.firstFailure) : fail('BROWSER_STAGE_FAILED');
      }
      const clean = JSON.stringify(await fingerprint(db)) === JSON.stringify(before);
      const developmentUnchanged = JSON.stringify(await developmentBaseline(process.env)) === JSON.stringify(dev);
      emit(run, { stage: label, runId: run, durationMs: Date.now() - stageStartedAt, exitCode: result.exitCode, fixtureBaselineRestored: clean, developmentUnchanged });
      if (!clean || !developmentUnchanged) throw fail('VERIFICATION_OR_CLEANUP');
      await serverRequire('./testUtils/databaseGuard').verifyDatabase(db, env, undefined, 'e2e');
    }
  } catch (error) { Object.assign(failures, failureState(error, 'runtime')); }
  finally {
    for (const child of [...children].reverse()) await cleanupStep(failures, 'process-shutdown', () => stopOwned(child, run));
    let fixtureBaselineRestored = null; let developmentUnchanged = null;
    await cleanupStep(failures, 'fixture-cleanup', async () => {
      if (before) { fixtureBaselineRestored = JSON.stringify(await fingerprint(db)) === JSON.stringify(before); if (!fixtureBaselineRestored) throw fail('FIXTURE_CHANGED'); }
      if (dev) { developmentUnchanged = JSON.stringify(await developmentBaseline(process.env)) === JSON.stringify(dev); if (!developmentUnchanged) throw fail('DEVELOPMENT_CHANGED'); }
    });
    await cleanupStep(failures, 'fixture-cleanup', () => db.$disconnect());
    if (root) await cleanupStep(failures, 'root-cleanup', async () => {
      if (!children.every((child) => child.ownedClosed)) throw fail('OWNED_PROCESS_STILL_OPEN');
      await waitForExit((remaining) => ownedProcessesGone(root, remaining));
      await removeOwnedRoot(ownedRoot);
    });
      emit(run, { status: 'runtime-cleanup', runId: run, durationMs: Date.now() - startedAt, fixtureBaselineRestored, developmentUnchanged,
        temporaryRootRemoved: Boolean(root) && !fs.existsSync(root), ownedProcessesStopped: children.every((child) => child.ownedClosed),
        ...(failures.primary ? { primary: failures.primary, secondary: failures.secondary } : {}) });
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  }
  if (failures.primary) throw failureError(failures);
}
if (require.main === module) main().catch((error) => { console.error('E2E refused or failed: ' + JSON.stringify(failureState(error, 'runtime'))); process.exitCode = 1; });
module.exports = { childEnvironment, GROUPS, developmentBaseline, runtimeWorkingDirectory };
