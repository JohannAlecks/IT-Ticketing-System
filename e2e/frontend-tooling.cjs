const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
async function loadFrontendTooling() {
  const clientRequire = createRequire(path.resolve(__dirname, '../client/package.json'));
  const vite = await import(pathToFileURL(clientRequire.resolve('vite')).href);
  // Node resolves Vite's CJS entry here: its dynamically imported API lives in
  // default, not a named createServer export. New ESM entries may expose either.
  const createServer = vite.createServer || vite.default?.createServer;
  const { default: react } = await import(pathToFileURL(clientRequire.resolve('@vitejs/plugin-react')).href);
  if (typeof createServer !== 'function' || typeof react !== 'function') throw new Error('E2E frontend tooling is unavailable');
  return { createServer, react };
}
module.exports = { loadFrontendTooling };
