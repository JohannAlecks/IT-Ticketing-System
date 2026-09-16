const http = require('node:http');

// Native HTTP avoids the observed fetch-only timeout on the local Vite server.
// No redirects, body logging, identity fallback, or unbounded request is allowed.
function readIdentity(url, runId, { get = http.get, timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    let request; let settled = false; let phase = 'connecting'; const started = Date.now();
    const finish = (error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { request?.destroy(); reject(Object.assign(new Error(error), { phase, elapsedMs: Date.now() - started })); } else resolve();
    };
    const timer = setTimeout(() => finish('READINESS_TIMEOUT'), timeoutMs);
    try {
      request = get(url, (response) => {
        phase = 'body';
        const valid = response.statusCode === 200 && response.headers['x-e2e-run-id'] === runId;
        response.once('error', () => finish('READINESS_TRANSPORT'));
        response.once('end', () => finish(valid ? null : 'READINESS_IDENTITY'));
        response.resume();
      });
      request.once('error', () => finish('READINESS_TRANSPORT'));
      request.once('socket', (socket) => { if (socket.connecting) socket.once('connect', () => { phase = 'headers'; }); else phase = 'headers'; });
    } catch { finish('READINESS_TRANSPORT'); }
  });
}
module.exports = { readIdentity };
