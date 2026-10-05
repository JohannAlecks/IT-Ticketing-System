const fs = require('node:fs'); const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('@playwright/test');
const { temporaryRoot, environment, WEB, fail } = require('./safety.cjs');
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
async function withIsolatedBrowser(use, info) {
  environment(); const root = temporaryRoot(process.env.E2E_TEMP_ROOT);
  if (info.project.use.channel !== 'chrome') throw fail('CHROME_CHANNEL_REQUIRED');
  const profileParent = path.join(root, 'browser-' + randomUUID()); fs.mkdirSync(profileParent);
  const original = { TMP: process.env.TMP, TEMP: process.env.TEMP }; let browser;
  try {
    // Playwright creates its own non-persistent user-data directory beneath this
    // owned temp root. Never attach to Chrome or supply a personal userDataDir.
    try {
      process.env.TMP = profileParent; process.env.TEMP = profileParent;
      browser = await chromium.launch({ channel: 'chrome', headless: info.project.use.headless ?? true, timeout: 30000 });
    } finally {
      for (const key of ['TMP', 'TEMP']) original[key] === undefined ? delete process.env[key] : process.env[key] = original[key];
    }
    if (browser.version() !== '154.0.8037.95') throw fail('CHROME_VERSION_CHANGED');
    if (fs.readdirSync(profileParent).filter((name) => name.startsWith('playwright_chromiumdev_profile-')).length !== 1) throw fail('FRESH_PROFILE_REQUIRED');
    await use(browser);
  } finally {
    await browser?.close();
    await profileEmpty(profileParent);
    const chromeFetchArtifactsRemoved = removeChromeFetchArtifacts(root, profileParent, !browser?.isConnected());
    const empty = fs.readdirSync(profileParent).length === 0;
    if (!empty) console.log(JSON.stringify({ status: 'browser-cleanup-diagnostic', remnants: fs.readdirSync(profileParent, { withFileTypes: true }).map(entry => ({ category: entry.name.startsWith('playwright_chromiumdev_profile-') ? 'profile' : entry.name.startsWith('playwright-artifacts-') ? 'artifacts' : 'other', directory: entry.isDirectory() })) }));
    console.log(JSON.stringify({ status: 'browser-cleanup', browser: browser ? `Chrome ${browser.version()}` : 'not launched', disconnected: !browser?.isConnected(), profileAndArtifactsRemoved: empty, chromeFetchArtifactsRemoved }));
    if (!empty) throw fail('BROWSER_PROFILE_CLEANUP');
    fs.rmdirSync(profileParent);
  }
}
module.exports = { contextOptions, withIsolatedBrowser, profileEmpty, removeChromeFetchArtifacts };
