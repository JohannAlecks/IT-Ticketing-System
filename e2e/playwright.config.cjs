const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs', fullyParallel: false, workers: 1,
  testIgnore: process.env.E2E_A11Y === 'true' ? undefined : ['**/accessibility.spec.cjs', '**/compatibility.spec.cjs'],
  retries: 0, forbidOnly: true, timeout: 90000, expect: { timeout: 10000 },
  maxFailures: 1, globalTimeout: 20 * 60 * 1000,
  globalSetup: require.resolve('./global-setup.cjs'),
  reporter: [[require.resolve('./reporter.cjs')]],
  outputDir: './artifacts/test-results',
  // Error-context snapshots can contain synthetic account/page data even when
  // trace/screenshots are off. Retain only our redacted reporter evidence.
  preserveOutput: 'never',
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:5411', trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block', actionTimeout: 10000, navigationTimeout: 15000 },
  projects: [
    { name: 'desktop-chrome-154.0.8037.95', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, userAgent: undefined } },
    { name: 'mobile-emulated-chrome-154.0.8037.95', grep: /@mobile/, use: { ...devices['Pixel 7'], userAgent: devices['Pixel 7'].userAgent.replace(/Chrome\/[\d.]+/, 'Chrome/154.0.8037.95') } },
  ],
});
