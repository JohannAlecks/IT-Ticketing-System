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
test('global setup permits bounded cold startup but keeps teardown identity strict', async () => {
  const safetyPath = require.resolve('./safety.cjs'); const setupPath = require.resolve('./global-setup.cjs');
  const original = require.cache[safetyPath].exports; const calls = []; let disconnected = false;
  try {
    require.cache[safetyPath].exports = { ...original,
      runtimeIdentity: async (...args) => { calls.push(args); },
      database: async () => ({ $disconnect: async () => { disconnected = true; } }),
      fingerprint: async () => ({ digest: 'synthetic-unchanged' }),
    };
    delete require.cache[setupPath];
    const teardown = await require('./global-setup.cjs')(); await teardown();
    assert.equal(calls[0][0], process.env); assert.equal(calls[0][1], 15000);
    assert.deepEqual(calls[1], []); assert.equal(disconnected, true);
  } finally { require.cache[safetyPath].exports = original; delete require.cache[setupPath]; }
});
const env = () => ({ NODE_ENV: 'test', RUN_E2E_TESTS: 'true', E2E_APPROVED: 'true', EMAIL_PROVIDER: 'disabled',
  E2E_DATABASE_URL: 'postgresql://fixture:unused@localhost:5432/ticketing_e2e_test?schema=public', E2E_RUN_ID: randomUUID(), E2E_API_URL: API, E2E_WEB_URL: WEB });

test('gradient contrast uses RGB luminance, not alpha, and detects insufficient contrast', async () => {
  const { summaryContrast } = require('./contrast.cjs'); const original = global.getComputedStyle;
  try {
    global.getComputedStyle = (element) => element.style;
    for (const [foreground, background, ratio] of [['0, 0, 0', '255, 255, 255', 21], ['255, 255, 255', '0, 0, 0', 21], ['120, 120, 120', '120, 120, 120', 1]]) {
      const section = { style: { backgroundColor: `rgb(${background})`, backgroundImage: `linear-gradient(rgb(${background}), rgb(${background}))` },
        querySelectorAll: () => [{ tagName: 'P', style: { color: `rgba(${foreground}, 1)`, fontSize: '14px', fontWeight: '400' } }] };
      const [sample] = await summaryContrast({ locator: () => ({ evaluate: (fn) => fn(section) }) });
      assert.equal(sample.conservativeRatio, ratio); assert.equal(sample.required, 4.5);
    }
  } finally { global.getComputedStyle = original; }
});

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

test('profile cleanup waits for asynchronous removal but rejects persistent remnants', async () => {
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const { profileEmpty } = require('./browser-fixture.cjs');
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-e2e-'));
  const child = path.join(root, 'synthetic-profile'); let timer;
  try {
    fs.mkdirSync(child); assert.equal(await profileEmpty(root, 50), false);
    timer = setTimeout(() => fs.rmdirSync(child), 20);
    assert.equal(await profileEmpty(root, 1000), true);
  } finally { clearTimeout(timer); temporaryRoot(root); if (fs.existsSync(child)) fs.rmdirSync(child); fs.rmdirSync(root); }
});

test('Chrome fetch cleanup removes only owned scratch directories after disconnection', async () => {
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const { removeChromeFetchArtifacts, profileEmpty } = require('./browser-fixture.cjs');
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-e2e-'));
  const directory = path.join(root, 'browser-' + randomUUID()); fs.mkdirSync(directory);
  const fetcher = path.join(directory, 'chrome_chrome_url_fetcher_123_456');
  const profile = path.join(directory, 'playwright_chromiumdev_profile-synthetic');
  const unknown = path.join(directory, 'unexpected');
  try {
    for (const target of [fetcher, profile, unknown]) fs.mkdirSync(target);
    fs.writeFileSync(path.join(fetcher, 'synthetic.tmp'), 'synthetic');
    assert.throws(() => removeChromeFetchArtifacts(root, directory, false), /BROWSER_TEMP_BOUNDARY/);
    assert.equal(fs.existsSync(fetcher), true);
    assert.throws(() => removeChromeFetchArtifacts(root, root, true), /BROWSER_TEMP_BOUNDARY/);
    assert.equal(removeChromeFetchArtifacts(root, directory, true), 1);
    assert.equal(fs.existsSync(fetcher), false);
    assert.equal(fs.existsSync(profile), true); assert.equal(fs.existsSync(unknown), true);
    assert.equal(await profileEmpty(directory, 0), false);
    fs.rmdirSync(profile); fs.rmdirSync(unknown);
    assert.equal(await profileEmpty(directory, 0), true);
  } finally { temporaryRoot(root); fs.rmSync(root, { recursive: true }); }
});

test('Chrome fetch cleanup refuses links into another owned directory', () => {
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const { removeChromeFetchArtifacts } = require('./browser-fixture.cjs');
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-e2e-'));
  const directory = path.join(root, 'browser-' + randomUUID()); fs.mkdirSync(directory);
  const outside = path.join(root, 'not-browser-scratch'); fs.mkdirSync(outside);
  const fetcher = path.join(directory, 'chrome_chrome_url_fetcher_123_456'); fs.mkdirSync(fetcher);
  const link = path.join(fetcher, 'redirect');
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => removeChromeFetchArtifacts(root, directory, true), /BROWSER_TEMP_BOUNDARY/);
    assert.equal(fs.existsSync(outside), true); assert.equal(fs.existsSync(fetcher), true);
  } finally { if (fs.existsSync(link)) fs.unlinkSync(link); temporaryRoot(root); fs.rmSync(root, { recursive: true }); }
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
