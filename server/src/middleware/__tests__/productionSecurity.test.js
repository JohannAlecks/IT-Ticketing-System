const { security } = require('../../config/security');
const path = require('path');
const valid = () => ({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:1/synthetic',
  JWT_SECRET: require('crypto').randomBytes(48).toString('hex'), CLIENT_URL: 'https://app.example.test', CORS_ORIGINS: 'https://app.example.test',
  STORAGE_PROVIDER: 'local', ATTACHMENT_STORAGE_ROOT: path.resolve('synthetic-not-accessed'), ATTACHMENT_STORAGE_PERSISTENT: 'true' });
test('production requires explicit origins, persistent storage and a strong secret', () => {
  expect(security(valid(), 'https://app.example.test')).toMatchObject({ TRUST_PROXY: false, PORT: 5000, UPLOAD_RATE_LIMIT_MAX: 20 });
});
test.each([
  ['JWT_SECRET', 'short'], ['JWT_SECRET', 'a'.repeat(100)], ['CORS_ORIGINS', '*'], ['CORS_ORIGINS', 'https://app.example.test/path'],
  ['CORS_ORIGINS', 'https://*.example.test'], ['JWT_EXPIRES_IN', '2d'], ['JWT_EXPIRES_IN', 'forever'],
  ['CORS_ORIGINS', 'http://app.example.test'], ['CORS_ORIGINS', ''], ['CORS_ORIGINS', 'https://user:password@app.example.test'],
  ['TRUST_PROXY', 'true'], ['TRUST_PROXY', '1'], ['TRUST_PROXY', '0.0.0.0/0'], ['TRUST_PROXY', '::/0'],
  ['PORT', 'NaN'], ['API_RATE_LIMIT_MAX', '-1'], ['UPLOAD_RATE_LIMIT_WINDOW_MS', 'Infinity'], ['MAX_ATTACHMENT_SIZE_MB', '0'],
  ['DATABASE_URL', 'invalid-sensitive-value'], ['STORAGE_PROVIDER', 's3'], ['ATTACHMENT_STORAGE_PERSISTENT', 'false'], ['ATTACHMENT_STORAGE_ROOT', 'relative'],
  ['NODE_ENV', 'prod'],
])('rejects unsafe %s without echoing its value', (key, value) => {
  expect(() => security({ ...valid(), [key]: value }, 'https://app.example.test')).toThrow('Invalid configuration:');
});
test('trusts only explicit addresses and ranges', () => {
  expect(security({ ...valid(), TRUST_PROXY: '127.0.0.1,::1/128' }, 'https://app.example.test').TRUST_PROXY).toEqual(['127.0.0.1', '::1/128']);
});
test('hex-encoded secrets do not need all sixteen hexadecimal digits present', () => {
  const syntheticSecret = '0123456789abcde'.repeat(4);
  expect(() => security({ ...valid(), JWT_SECRET: syntheticSecret }, 'https://app.example.test')).not.toThrow();
});

const limiter = require('../rateLimit');
const invoke = (limit, req = { ip: 'synthetic-ip' }) => {
  const next = jest.fn(); const res = { setHeader: jest.fn() }; limit(req, res, next); return { next, res };
};
test('limits, expires and isolates routes without using identity headers', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(0);
  try {
    const a = limiter({ windowMs: 1000, max: 1 }); const b = limiter({ windowMs: 1000, max: 1 });
    expect(invoke(a).next).toHaveBeenCalledWith();
    const denied = invoke(a, { ip: 'synthetic-ip', headers: { 'x-user-id': 'other', 'x-forwarded-for': 'other' } });
    expect(denied.next.mock.calls[0][0]).toMatchObject({ statusCode: 429, message: 'Too many requests. Please try again later.' });
    expect(denied.res.setHeader).toHaveBeenCalledWith('Retry-After', 1);
    expect(invoke(b).next).toHaveBeenCalledWith();
    now.mockReturnValue(1000); expect(invoke(a).next).toHaveBeenCalledWith();
  } finally { now.mockRestore(); }
});
test('limiter bounds unique-client memory and expires old entries', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(0);
  try {
    const limit = limiter({ windowMs: 1000, max: 1 });
    for (let i = 0; i < 10000; i++) invoke(limit, { ip: String(i) });
    expect(invoke(limit).next.mock.calls[0][0].statusCode).toBe(429);
    now.mockReturnValue(1000); expect(invoke(limit).next).toHaveBeenCalledWith();
  } finally { now.mockRestore(); }
});
test.each([new Error('private SQL /server/path token'), Object.assign(new Error('private'), { statusCode: 400 }), Object.assign(new Error('private'), { code: 'P2002', meta: { target: ['private-field'] } })])('unexpected errors are sanitized', (error) => {
  const status = jest.fn().mockReturnThis(); const json = jest.fn();
  require('../errorHandler')(error, { requestId: 'safe-id' }, { status, json }, jest.fn());
  expect(JSON.stringify(json.mock.calls)).not.toMatch(/private|SQL|stack|meta/);
});
test('unmatched request logs do not contain path, query, headers or body secrets', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    require('../requestLogger')({ path: '/private', originalUrl: '/private?token=secret', body: { password: 'private' }, headers: { authorization: 'private' }, method: 'GET' }, { on: (_, cb) => cb(), statusCode: 404 }, () => {});
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/private|secret|password|authorization/);
  } finally { spy.mockRestore(); }
});

const { createReadiness } = require('../../config/readiness');
const manifest = [{ name: 'synthetic', checksum: 'synthetic-checksum' }];
const healthy = { migration_name: 'synthetic', checksum: 'synthetic-checksum', finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 };
function readiness(rows) {
  const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue(rows) };
  const db = { $transaction: jest.fn((cb) => cb(tx)) }; return { check: createReadiness(db, manifest), db, tx };
}
test('readiness verifies the ledger read-only, coalesces polling and fails during drain', async () => {
  const { check, db, tx } = readiness([healthy]);
  expect(await Promise.all([check.check(), check.check()])).toEqual([true, true]);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.$executeRaw.mock.calls[0][0][0]).toBe('SET TRANSACTION READ ONLY');
  check.drain(); expect(await check.check()).toBe(false);
});
test.each([[], [{ ...healthy, checksum: 'changed' }], [{ ...healthy, finished_at: null }], [{ ...healthy, applied_steps_count: 0 }]].map((rows) => ({ rows })))('unapplied or altered migrations fail readiness', async ({ rows }) => {
  expect(await readiness(rows).check.check()).toBe(false);
});
test('database failures do not expose errors through readiness', async () => {
  expect(await createReadiness({ $transaction: () => Promise.reject(new Error('private connection')) }, manifest).check()).toBe(false);
});
test('shutdown drains HTTP before disconnecting Prisma and runs once', async () => {
  const calls = []; let closed;
  const stop = require('../../config/lifecycle').createShutdown({
    readiness: { drain: () => calls.push('drain') }, server: { close: (cb) => { calls.push('close'); closed = cb; }, closeIdleConnections: jest.fn() },
    prisma: { $disconnect: async () => calls.push('disconnect') }, exit: (code) => calls.push(code),
  });
  stop(); stop(); expect(calls).toEqual(['drain', 'close']); await closed(); expect(calls).toEqual(['drain', 'close', 'disconnect', 0]);
});
test('shutdown force-closes only owned HTTP connections at its deadline', () => {
  jest.useFakeTimers();
  try {
    const server = { close: jest.fn(), closeAllConnections: jest.fn() }; const exit = jest.fn();
    require('../../config/lifecycle').createShutdown({ server, prisma: {}, readiness: { drain: jest.fn() }, exit, timeoutMs: 20 })();
    jest.advanceTimersByTime(20); expect(server.closeAllConnections).toHaveBeenCalledTimes(1); expect(exit).toHaveBeenCalledWith(1);
  } finally { jest.useRealTimers(); }
});
test('JWT verification rejects other HMAC algorithms', () => {
  const jwt = require('jsonwebtoken'); const env = require('../../config/env');
  const token = jwt.sign({ sub: 'synthetic-id' }, env.JWT_SECRET, { algorithm: 'HS384' });
  expect(() => require('../../utils/jwt').verifyToken(token)).toThrow('invalid algorithm');
});
test.each([
  ['.png', '89504e470d0a1a0a'], ['.jpg', 'ffd8ff'], ['.webp', '524946460000000057454250'],
  ['.pdf', '255044462d'], ['.doc', 'd0cf11e0a1b11ae1'], ['.xlsx', '504b0304'],
])('bounded signature check accepts %s signature and rejects disguised executable', (ext, hex) => {
  const { validPrefix } = require('../attachmentSignature');
  expect(validPrefix(ext, Buffer.from(hex, 'hex'))).toBe(true);
  expect(validPrefix(ext, Buffer.from('MZ-not-a-document'))).toBe(false);
});
test('frontend deployment CSP allows only the documented style exception', () => {
  const config = require('../../../../client/vercel.json');
  const csp = config.headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value;
  expect(csp).toContain("script-src 'self'; script-src-attr 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(csp.match(/unsafe-inline/g)).toHaveLength(1);
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).toContain('https://api.example.com');
});
