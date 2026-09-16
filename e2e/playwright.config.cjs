const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs', fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, timeout: 90000, expect: { timeout: 10000 },
  maxFailures: 1, globalTimeout: 20 * 60 * 1000,
  globalSetup: require.resolve('./global-setup.cjs'),
  reporter: [[require.resolve('./reporter.cjs')]],
  outputDir: './artifacts/test-results',
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:5411', trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block', actionTimeout: 10000, navigationTimeout: 15000 },
  projects: [
    { name: 'desktop-chrome-152', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, userAgent: undefined } },
    { name: 'mobile-emulated-chrome-152', grep: /@mobile/, use: { ...devices['Pixel 7'], userAgent: devices['Pixel 7'].userAgent.replace(/Chrome\/[\d.]+/, 'Chrome/152.0.7977.83') } },
  ],
});
