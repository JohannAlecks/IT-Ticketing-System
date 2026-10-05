jest.mock('../../config/prisma', () => ({}));
const app = require('../../app');
let server; let base;
beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
test('liveness sends strict API CSP and privacy headers without requiring database', async () => {
  const res = await fetch(base + '/health');
  expect(res.status).toBe(200); expect(await res.json()).toEqual({ status: 'ok' });
  expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(res.headers.get('content-security-policy')).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(res.headers.get('x-frame-options')).toBe('DENY');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(res.headers.get('permissions-policy')).toContain('camera=()');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.has('x-powered-by')).toBe(false);
});
test('CORS admits configured origin and refuses a foreign origin', async () => {
  const env = require('../../config/env');
  const allowed = await fetch(base + '/health', { headers: { Origin: env.CORS_ORIGINS[0] } });
  expect(allowed.headers.get('access-control-allow-origin')).toBe(env.CORS_ORIGINS[0]);
  const rejected = await fetch(base + '/health', { headers: { Origin: 'https://foreign.example.test' } });
  expect(rejected.status).toBe(403); expect(rejected.headers.has('access-control-allow-origin')).toBe(false);
});
test('readiness response is generic on dependency failure', async () => {
  const spy = jest.spyOn(app.locals.readiness, 'check').mockResolvedValue(false);
  try { const res = await fetch(base + '/health/ready'); expect(res.status).toBe(503); expect(await res.json()).toEqual({ status: 'unavailable' }); }
  finally { spy.mockRestore(); }
});
test('production API requests fail closed while readiness is false, then retain authentication', async () => {
  const env = require('../../config/env'); const old = env.NODE_ENV; env.NODE_ENV = 'production';
  const spy = jest.spyOn(app.locals.readiness, 'check').mockResolvedValue(false);
  try {
    const denied = await fetch(base + '/api/auth/me'); expect(denied.status).toBe(503);
    expect(await denied.json()).toMatchObject({ message: 'Service is temporarily unavailable' });
    spy.mockResolvedValue(true);
    expect((await fetch(base + '/api/auth/me')).status).toBe(401);
  } finally { spy.mockRestore(); env.NODE_ENV = old; }
});
test('unknown routes never reflect supplied tokens or paths', async () => {
  const res = await fetch(base + '/private-token?secret=private');
  expect(res.status).toBe(404); expect(JSON.stringify(await res.json())).not.toContain('private');
});
test('verification has a separate IP limit that spoofed identity headers cannot evade', async () => {
  const max = require('../../config/env').AUTH_RATE_LIMIT_MAX;
  for (let i = 0; i < max; i++) {
    const res = await fetch(base + '/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(422);
  }
  const denied = await fetch(base + '/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.2', 'X-User-Id': 'another' }, body: '{}' });
  expect(denied.status).toBe(429); expect(await denied.json()).toMatchObject({ message: 'Too many requests. Please try again later.' });
  const separate = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(separate.status).toBe(422);
});
