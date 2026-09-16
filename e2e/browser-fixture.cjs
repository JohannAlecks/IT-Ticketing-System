const fs = require('node:fs'); const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('@playwright/test');
const { temporaryRoot, environment, WEB, fail } = require('./safety.cjs');
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
    if (browser.version() !== '152.0.7977.83') throw fail('CHROME_VERSION_CHANGED');
    if (fs.readdirSync(profileParent).filter((name) => name.startsWith('playwright_chromiumdev_profile-')).length !== 1) throw fail('FRESH_PROFILE_REQUIRED');
    await use(browser);
  } finally {
    await browser?.close();
    const empty = fs.readdirSync(profileParent).length === 0;
    console.log(JSON.stringify({ status: 'browser-cleanup', browser: 'Chrome 152.0.7977.83', disconnected: !browser?.isConnected(), profileAndArtifactsRemoved: empty }));
    if (!empty) throw fail('BROWSER_PROFILE_CLEANUP');
    fs.rmdirSync(profileParent);
  }
}
module.exports = { contextOptions, withIsolatedBrowser };
