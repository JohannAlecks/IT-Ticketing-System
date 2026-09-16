// Standalone test launcher only. Never imported by the production server.
const { environment, database, temporaryRoot, serverRequire, API, WEB, fail } = require('./safety.cjs');
const path = require('node:path');
const { loadFrontendTooling } = require('./frontend-tooling.cjs');
let close; let phase = 'environment';
async function start() {
  environment(); temporaryRoot(process.env.E2E_TEMP_ROOT);
  if (!process.send) throw fail('OWNED_CHILD_REQUIRED');
  if (process.argv[2] === 'api') {
    phase = 'api-database';
    const db = await database();
    // Prevent dotenv from reading unrelated credentials. Inject the verified
    // client and real storage implementation before loading the real application.
    serverRequire('dotenv').config = () => ({ parsed: {} });
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
    const slot = (id, exports) => { const filename = serverRequire.resolve(id); require.cache[filename] = { id: filename, filename, loaded: true, exports }; };
    slot('./src/config/prisma', db);
    const storage = serverRequire('./src/modules/attachments/attachment.storage');
    const root = path.join(process.env.E2E_TEMP_ROOT, 'uploads');
    slot('./src/modules/attachments/attachment.storage', { ...storage, store: storage.createStore(root), UPLOAD_ROOT: root });
    slot('resend', { Resend: class { constructor() { throw fail('PROVIDER_FORBIDDEN'); } } });
    global.fetch = () => { throw fail('OUTBOUND_NETWORK'); };
    // The application currently uses fetch for delivery; also refuse direct HTTP
    // clients so a later provider integration cannot escape this runtime.
    for (const module of ['node:http', 'node:https']) {
      const http = require(module);
      http.request = http.get = () => { throw fail('OUTBOUND_NETWORK'); };
    }
    phase = 'api-import'; const app = serverRequire('./src/app');
    let active = 0;
    const server = require('node:http').createServer((req, res) => {
      res.setHeader('x-e2e-run-id', process.env.E2E_RUN_ID);
      if (req.url === '/health') res.setHeader('x-e2e-active-requests', String(active));
      else {
        active++; let ended = false; const end = res.end;
        // Do not treat a browser-aborted socket as a completed database write.
        // Application response completion happens after its awaited transaction.
        res.end = function (...args) { try { return end.apply(this, args); } finally { if (!ended) { ended = true; active--; } } };
      }
      app(req, res);
    });
    phase = 'api-listen'; await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(new URL(API).port), '127.0.0.1', resolve); });
    close = async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await db.$disconnect(); };
  } else if (process.argv[2] === 'web') {
    phase = 'web-import';
    const { createServer, react } = await loadFrontendTooling();
    phase = 'web-create'; const server = await createServer({ root: path.resolve(__dirname, '../client'), configFile: false,
      envDir: false, mode: 'e2e', logLevel: 'silent', plugins: [react()],
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify(API + '/api') },
      server: { host: '127.0.0.1', port: Number(new URL(WEB).port), strictPort: true,
        headers: { 'x-e2e-run-id': process.env.E2E_RUN_ID }, watch: null } });
    phase = 'web-listen'; await server.listen(); close = () => server.close();
  } else throw fail('RUNTIME_KIND');
  process.send({ ready: true, run: process.env.E2E_RUN_ID });
}
let stopping = false;
async function stop() { if (stopping) return; stopping = true; try { await close?.(); } finally { process.exit(0); } }
process.on('message', (m) => { if (m?.stop === process.env.E2E_RUN_ID) void stop(); });
process.on('disconnect', () => void stop());
process.on('SIGTERM', () => void stop());
function reportFailure(error) {
  const category = /^E2E refused: ([A-Z_]+) /.exec(error.message || '')?.[1] ||
    (['EACCES', 'EPERM', 'EADDRINUSE', 'ENOENT', 'ERR_REQUIRE_ESM'].includes(error.code) ? error.code : 'RUNTIME_START');
  const frames = [...(error.stack || '').matchAll(/([A-Za-z0-9_.-]+\.[cm]?js):(\d+):\d+/g)].slice(0, 3).map((m) => `${m[1]}:${m[2]}`);
  process.send?.({ failed: true, category, phase, frames });
}
process.on('unhandledRejection', (error) => { reportFailure(error instanceof Error ? error : new Error('Runtime rejection')); void stop(); });
start().catch((error) => { reportFailure(error); process.exit(1); });
