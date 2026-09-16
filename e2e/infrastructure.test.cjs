const { test } = require('node:test'); const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { serverRequire, environment, temporaryRoot, API, WEB } = require('./safety.cjs');
const { childEnvironment } = require('./runner.cjs');
const guard = serverRequire('./testUtils/databaseGuard');
test('web runtime uses client cwd so Tailwind scans the real application', () => {
  const path = require('node:path'); const { runtimeWorkingDirectory } = require('./runner.cjs');
  assert.equal(runtimeWorkingDirectory('web'), path.resolve(__dirname, '../client'));
  assert.equal(runtimeWorkingDirectory('api'), path.resolve(__dirname, '../server'));
});
const env = () => ({ NODE_ENV: 'test', RUN_E2E_TESTS: 'true', E2E_APPROVED: 'true', EMAIL_PROVIDER: 'disabled',
  E2E_DATABASE_URL: 'postgresql://fixture:unused@localhost:5432/ticketing_e2e_test?schema=public', E2E_RUN_ID: randomUUID(), E2E_API_URL: API, E2E_WEB_URL: WEB });

test('native readiness requires exact identity and 200, drains bodies, and rejects transport failures', async () => {
  const { EventEmitter } = require('node:events'); const { readIdentity } = require('./readiness.cjs');
  for (const [status, identity, valid] of [[200, 'owned', true], [200, 'foreign', false], [302, 'owned', false], [503, 'owned', false]]) {
    let drained = false;
    const get = (_, callback) => {
      const request = new EventEmitter(); request.destroy = () => {};
      queueMicrotask(() => { const response = new EventEmitter(); response.statusCode = status; response.headers = { 'x-e2e-run-id': identity };
        response.resume = () => { drained = true; queueMicrotask(() => response.emit('end')); }; callback(response); }); return request;
    };
    if (valid) await readIdentity(WEB, 'owned', { get }); else await assert.rejects(readIdentity(WEB, 'owned', { get }), /READINESS_IDENTITY/);
    assert.equal(drained, true);
  }
  const broken = () => { const request = new EventEmitter(); request.destroy = () => {}; queueMicrotask(() => request.emit('error', new Error('private transport details'))); return request; };
  await assert.rejects(readIdentity(WEB, 'owned', { get: broken }), (error) => error.message === 'READINESS_TRANSPORT');
  let destroyed = false;
  const stalled = () => { const request = new EventEmitter(); request.destroy = () => { destroyed = true; }; return request; };
  await assert.rejects(readIdentity(WEB, 'owned', { get: stalled, timeoutMs: 10 }), /READINESS_TIMEOUT/);
  assert.equal(destroyed, true);
});

test('custom role contexts forward every configured mobile descriptor field', () => {
  const { devices } = require('@playwright/test'); const { contextOptions } = require('./browser-fixture.cjs');
  const options = contextOptions(devices['Pixel 7']);
  for (const [key, value] of Object.entries(devices['Pixel 7'])) if (key !== 'defaultBrowserType') assert.deepEqual(options[key], value);
  assert.equal(options.serviceWorkers, 'block'); assert.equal(options.baseURL, WEB);
  assert.equal(options.storageState, undefined);
});

test('frontend tooling exposes the real Vite server factory through CJS/ESM interop', async () => {
  const { createServer, react } = await require('./frontend-tooling.cjs').loadFrontendTooling();
  assert.equal(typeof createServer, 'function'); assert.equal(typeof react, 'function');
});
test('E2E purpose accepts only its explicit profile; integration boundary is unchanged', () => {
  assert.equal(guard.validateEnvironment(env(), 'e2e').database, 'ticketing_e2e_test');
  assert.throws(() => guard.validateEnvironment(env()), /OPT_IN/);
  for (const name of ['ticketing_db', 'ticketing_test', 'production_test', 'ticketing_e2e_test_backup']) assert.throws(() => guard.validateEnvironment({ ...env(), E2E_DATABASE_URL: env().E2E_DATABASE_URL.replace('ticketing_e2e_test', name) }, 'e2e'), /DATABASE/);
});

test('E2E rejects alternate schemas, connection redirects and remote hosts', () => {
  for (const url of [
    'postgresql://fixture:unused@outside.invalid:5432/ticketing_e2e_test?schema=public',
    'postgresql://fixture:unused@localhost:5433/ticketing_e2e_test?schema=public',
    'postgresql://fixture:unused@localhost:5432/ticketing_e2e_test?schema=private',
    'postgresql://fixture:unused@localhost:5432/ticketing_e2e_test?schema=public&schema=private',
    'postgresql://fixture:unused@localhost:5432/ticketing_e2e_test?schema=public&host=elsewhere',
  ]) assert.throws(() => environment({ ...env(), E2E_DATABASE_URL: url }));
});

test('temporary root accepts only a direct owned directory, never repository uploads', () => {
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const temp = fs.realpathSync(os.tmpdir()); const root = fs.mkdtempSync(path.join(temp, 'ticketing-e2e-'));
  try {
    assert.equal(temporaryRoot(root), root);
    assert.throws(() => temporaryRoot(path.resolve(__dirname, '../server/uploads')), /TEMP_ROOT/);
    assert.throws(() => temporaryRoot(path.join(root, 'nested')), /TEMP_ROOT/);
    assert.throws(() => temporaryRoot(temp), /TEMP_ROOT/);
  } finally { temporaryRoot(root); fs.rmdirSync(root); }
});

test('runner refuses missing approval before allocating runtime or connecting to a database', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const child = spawnSync(process.execPath, [path.join(__dirname, 'runner.cjs'), 'smoke'], {
    env: { ...process.env, E2E_APPROVED: '', E2E_DATABASE_URL: env().E2E_DATABASE_URL }, encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  assert.equal(child.status, 1); assert.equal(child.stdout, '');
  assert.match(child.stderr, /E2E refused or failed/);
  assert.doesNotMatch(child.stderr, /fixture:unused|postgresql:/);
});
test('approval, process URLs, environment and provider all fail closed', () => {
  for (const patch of [{ E2E_APPROVED: '' }, { E2E_WEB_URL: 'http://localhost:5173' }, { E2E_API_URL: 'http://localhost:5000' }, { NODE_ENV: 'development' }, { RUN_E2E_TESTS: '' }, { EMAIL_PROVIDER: 'resend' }, { E2E_RUN_ID: '' }]) assert.throws(() => environment({ ...env(), ...patch }));
});
test('purpose-marker substitution is rejected before migration reads', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ database: 'ticketing_e2e_test', schema: 'public', port: 5432, address: '::1', purpose: guard.MARKER }]; } };
  await assert.rejects(guard.verifyDatabase(db, env(), undefined, 'e2e'), /IDENTITY/); assert.equal(calls, 1);
});
test('runtime allowlist strips ambient development, provider and preload configuration', () => {
  const input = { ...env(), DATABASE_URL: 'never-inherit', RESEND_API_KEY: 'never-inherit', NODE_OPTIONS: '--require unsafe', VITE_API_URL: 'https://outside.invalid' };
  const child = childEnvironment(input, '', randomUUID());
  for (const key of ['DATABASE_URL', 'RESEND_API_KEY', 'NODE_OPTIONS', 'VITE_API_URL']) assert.equal(child[key], undefined);
  assert.equal(child.EMAIL_PROVIDER, 'disabled'); assert.equal(child.E2E_DATABASE_URL, input.E2E_DATABASE_URL);
});
