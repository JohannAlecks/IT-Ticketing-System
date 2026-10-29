const fs = require('node:fs'); const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('@playwright/test');
const { temporaryRoot, environment, WEB, fail } = require('./safety.cjs');
const { failureState, failureError, cleanupStep } = require('./failure.cjs');
const { waitForExit, ownedProcessesGone } = require('./cleanup.cjs');
async function profileEmpty(directory, timeoutMs = 5000) {
  // On worker failure Playwright may disconnect before its asynchronous
  // directory cleanup finishes. Observe completion; never delete or ignore it.
  const deadline = Date.now() + timeoutMs;
  while (fs.readdirSync(directory).length) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}
function removeChromeFetchArtifacts(root, directory, disconnected) {
  // Chrome 153 can leave its URL-fetcher scratch directory after normal exit.
  // Never remove a profile, unknown artifact, or anything outside our owned root.
  temporaryRoot(root);
  if (!disconnected || path.dirname(directory) !== root || !/^browser-[a-f0-9-]{36}$/.test(path.basename(directory))) throw fail('BROWSER_TEMP_BOUNDARY');
  const verifyTree = (target) => {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || fs.realpathSync(target) !== target) throw fail('BROWSER_TEMP_BOUNDARY');
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) verifyTree(path.join(target, name));
  };
  if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) throw fail('BROWSER_TEMP_BOUNDARY');
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^chrome_chrome_url_fetcher_[0-9]+_[0-9]+$/.test(entry.name)) continue;
    const target = path.resolve(directory, entry.name);
    if (path.dirname(target) !== directory) throw fail('BROWSER_TEMP_BOUNDARY');
    verifyTree(target);
    fs.rmSync(target, { recursive: true }); removed++;
  }
  return removed;
}
function contextOptions(config) {
  const keys = ['viewport', 'screen', 'deviceScaleFactor', 'userAgent', 'isMobile', 'hasTouch', 'locale', 'timezoneId', 'colorScheme', 'reducedMotion', 'forcedColors', 'contrast'];
  return { ...Object.fromEntries(keys.filter((key) => config[key] !== undefined).map((key) => [key, config[key]])),
    baseURL: WEB, serviceWorkers: 'block', acceptDownloads: true };
}
async function browserLifecycle({ launch, verify, use, wait, inspect, record }) {
  let browser; let phase = 'launch'; const state = { primary: null, secondary: [] };
  const started = Date.now();
  try {
    browser = await launch(); await verify(browser);
    record({ status: 'browser-launch', browser: browser.version(), durationMs: Date.now() - started });
    phase = 'assertion'; await use(browser);
  } catch (error) { Object.assign(state, failureState(error, phase)); }
  // Explicit pages -> contexts -> browser ordering also flushes Playwright's
  // context-owned artifact handles. A close error cannot suppress later cleanup.
  const contexts = browser?.contexts() || [];
  for (const context of contexts) {
    for (const page of context.pages()) await cleanupStep(state, 'page-close', () => page.close());
  }
  for (const context of contexts) await cleanupStep(state, 'context-close', () => context.close());
  await cleanupStep(state, 'browser-close', async () => { await browser?.close(); });
  await cleanupStep(state, 'process-shutdown', wait);
  await cleanupStep(state, 'artifact-cleanup', () => inspect(state, browser));
  if (state.primary) {
    record({ status: 'browser-failure', ...state });
    throw failureError(state);
  }
}
async function withIsolatedBrowser(use, info) {
  environment(); const root = temporaryRoot(process.env.E2E_TEMP_ROOT);
  if (info.project.use.channel !== 'chrome') throw fail('CHROME_CHANNEL_REQUIRED');
  const profileParent = path.join(root, 'browser-' + randomUUID()); fs.mkdirSync(profileParent);
  const original = { TMP: process.env.TMP, TEMP: process.env.TEMP };
  const record = info.record || ((row) => console.log(JSON.stringify(row)));
  await browserLifecycle({
    launch: async () => {
    // Playwright creates its own non-persistent user-data directory beneath this
    // owned temp root. Never attach to Chrome or supply a personal userDataDir.
    try {
      process.env.TMP = profileParent; process.env.TEMP = profileParent;
      return await chromium.launch({ channel: 'chrome', headless: info.project.use.headless ?? true, timeout: 30000 });
    } finally {
      for (const key of ['TMP', 'TEMP']) original[key] === undefined ? delete process.env[key] : process.env[key] = original[key];
    }
    },
    verify: async (browser) => {
    if (browser.version() !== '155.0.8059.40') throw fail('CHROME_VERSION_CHANGED');
    if (fs.readdirSync(profileParent).filter((name) => name.startsWith('playwright_chromiumdev_profile-')).length !== 1) throw fail('FRESH_PROFILE_REQUIRED');
    }, use,
    wait: () => waitForExit((remaining) => ownedProcessesGone(root, remaining)),
    inspect: async (state, browser) => {
      await cleanupStep(state, 'profile-cleanup', async () => {
        await profileEmpty(profileParent);
        if (fs.readdirSync(profileParent).some((n) => n.startsWith('playwright_chromiumdev_profile-'))) throw fail('BROWSER_PROFILE_CLEANUP');
      });
      await cleanupStep(state, 'artifact-cleanup', async () => {
        if (fs.readdirSync(profileParent).some((n) => !n.startsWith('playwright_chromiumdev_profile-') && !/^chrome_chrome_url_fetcher_[0-9]+_[0-9]+$/.test(n))) throw fail('BROWSER_ARTIFACT_CLEANUP');
      });
      record({ status: 'browser-cleanup', browser: browser ? `Chrome ${browser.version()}` : 'not launched', disconnected: !browser?.isConnected(),
        profileAndArtifactsRemoved: !state.secondary.some((e) => ['profile-cleanup', 'artifact-cleanup'].includes(e.phase)) && !['profile-cleanup', 'artifact-cleanup'].includes(state.primary?.phase),
        scratchDeletionDeferredToRunner: true });
      // Never remove a profile before the outer runner has stopped web/API and
      // received the Playwright child's close event (reporter/streams closed).
    }, record,
  });
}
module.exports = { contextOptions, withIsolatedBrowser, profileEmpty, removeChromeFetchArtifacts, browserLifecycle };
