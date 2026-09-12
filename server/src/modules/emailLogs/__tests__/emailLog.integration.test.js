// Opt-in only AFTER the independent Email Logs migration is approved/applied.
// Synthetic metadata only; no mailer/provider call, historical backfill or DDL.
const { randomUUID, createHash } = require('crypto');
const enabled = process.env.RUN_EMAIL_LOG_DB_TESTS === 'true';
if (enabled && process.env.DATABASE_URL === 'postgresql://test:test@localhost:5432/test_db') require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
if (enabled) {
  const u = new URL(process.env.DATABASE_URL);
  if (u.hostname !== 'localhost' || (u.port || '5432') !== '5432' || u.pathname !== '/ticketing_db' || (u.searchParams.get('schema') || 'public') !== 'public') throw new Error('Email log database target mismatch (redacted)');
  process.env.EMAIL_PROVIDER = 'disabled';
}
jest.mock('resend', () => ({ Resend: jest.fn(() => { throw new Error('Provider calls forbidden in database tests'); }) }));
(enabled ? describe : describe.skip)('Email log database integrity, authorization and concurrency', () => {
  const db = require('../../../config/prisma'); const service = require('../emailLog.service');
  const hashes = []; const userIds = []; let baseline; let server; let baseUrl;
  let rejectMaskHash = null;
  db.$use((params, next) => {
    // Controlled DB rejection for only this suite's generated reservation.
    if (rejectMaskHash && params.model === 'EmailLog' && params.action === 'create' && params.args.data.idempotencyHash === rejectMaskHash) params.args.data.recipientMasked = 'a@example.test';
    return next(params);
  });
  function input() {
    const key = `verify-email/${randomUUID()}`; hashes.push(createHash('sha256').update(key).digest('hex'));
    return { messageType: 'EMAIL_VERIFICATION', to: 'synthetic@example.test', idempotencyKey: key };
  }
  async function pending() {
    const fields = service.metadata(input());
    return db.emailLog.create({ data: { ...fields, provider: 'RESEND', status: 'UNKNOWN', errorCategory: 'NOT_CONFIRMED', attemptCount: 1 } });
  }
  beforeAll(async () => {
    const rows = await db.$queryRaw`SELECT checksum, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = '20260912020000_add_email_delivery_logs' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../../../prisma/migrations/20260912020000_add_email_delivery_logs/migration.sql'));
    expect(rows).toHaveLength(1); expect(rows[0].applied_steps_count).toBe(1); expect(rows[0].checksum).toBe(createHash('sha256').update(sql).digest('hex'));
    baseline = await db.emailLog.count();
    server = require('../../../app').listen(0); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}/api/email-logs`;
  });
  afterAll(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      await db.emailLog.deleteMany({ where: { idempotencyHash: { in: hashes } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      expect(await db.emailLog.count({ where: { idempotencyHash: { in: hashes } } })).toBe(0);
      expect(await db.user.count({ where: { id: { in: userIds } } })).toBe(0);
      if (baseline !== undefined) expect(await db.emailLog.count()).toBe(baseline);
      expect(require('resend').Resend).not.toHaveBeenCalled();
      console.log('Email log fixture cleanup: synthetic logs/users=0; original log count preserved; provider calls=0');
    } finally { await db.$disconnect(); }
  });
  test('disabled metadata persists; concurrent reservations yield exactly one row', async () => {
    const message = input(); const results = await Promise.all(Array.from({ length: 8 }, () => service.begin(message)));
    expect(new Set(results.map((r) => r.row.id)).size).toBe(1); expect(results.every((r) => !r.shouldSend && r.row.status === 'DISABLED' && r.row.attemptCount === 0)).toBe(true);
    expect(await db.emailLog.count({ where: { idempotencyHash: service.metadata(message).idempotencyHash } })).toBe(1);
  });
  test('physical checks, indexes, enum and absence of foreign keys/content columns', async () => {
    const checks = await db.$queryRaw`SELECT conname, contype FROM pg_constraint WHERE conrelid='public.email_logs'::regclass`;
    expect(checks.filter((r) => r.contype === 'f')).toHaveLength(0);
    for (const name of ['email_logs_mask_check', 'email_logs_hash_check', 'email_logs_state_check']) expect(checks.some((r) => r.conname === name)).toBe(true);
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='email_logs'`;
    for (const name of ['email_logs_idempotencyHash_key', 'email_logs_createdAt_id_idx', 'email_logs_status_createdAt_id_idx']) expect(indexes.some((r) => r.indexname === name)).toBe(true);
    const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='email_logs'`;
    expect(columns.map((r) => r.column_name).sort()).toEqual([...Object.keys(service.select), 'idempotencyHash'].sort());
    const enums = await db.$queryRaw`SELECT enumlabel FROM pg_enum WHERE enumtypid='"EmailLogStatus"'::regtype ORDER BY enumsortorder`;
    expect(enums.map((r) => r.enumlabel)).toEqual(['DISABLED', 'UNKNOWN', 'ACCEPTED', 'FAILED']);
  });
  test('concurrent enabled-provider reservations grant exactly one send permit without making a provider call', async () => {
    const env = require('../../../config/env'); const previous = env.EMAIL_PROVIDER;
    env.EMAIL_PROVIDER = 'resend'; // Only the reservation service is invoked.
    try {
      const message = input(); const results = await Promise.all(Array.from({ length: 8 }, () => service.begin(message)));
      expect(results.filter((r) => r.shouldSend)).toHaveLength(1);
      expect(new Set(results.map((r) => r.row.id)).size).toBe(1);
      expect(results.every((r) => r.row.status === 'UNKNOWN')).toBe(true);
    } finally { env.EMAIL_PROVIDER = previous; }
  });
  test('database rejects unmasked recipients and dishonest status; rows remain intact', async () => {
    const { row } = await service.begin(input()); const before = await db.emailLog.findUnique({ where: { id: row.id } });
    // Booleans only to avoid raw PostgreSQL diagnostics in a failure report.
    const reject = (p, constraint) => p.then(() => false, (error) => error.message.includes(constraint) && /23514|check constraint/i.test(error.message));
    // Stay within VARCHAR(20) so this exercises the mask CHECK, not length.
    expect(await reject(db.emailLog.update({ where: { id: row.id }, data: { recipientMasked: 'a@example.test' } }), 'email_logs_mask_check')).toBe(true);
    expect(await reject(db.emailLog.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } }), 'email_logs_state_check')).toBe(true);
    expect(await reject(db.emailLog.update({ where: { id: row.id }, data: { errorCategory: null } }), 'email_logs_state_check')).toBe(true);
    expect(JSON.stringify(await db.emailLog.findUnique({ where: { id: row.id } })) === JSON.stringify(before)).toBe(true);
    const invalidReservation = input(); rejectMaskHash = service.metadata(invalidReservation).idempotencyHash;
    try {
      const error = await service.begin(invalidReservation).then(() => null, (caught) => ({ status: caught.statusCode, message: caught.message }));
      expect(error).toEqual({ status: 503, message: 'Email operation unavailable' });
      expect(await db.emailLog.count({ where: { idempotencyHash: rejectMaskHash } })).toBe(0);
    } finally { rejectMaskHash = null; }
  });
  test('competing completions have one winner; terminal state cannot be downgraded', async () => {
    const row = await pending(); const results = await Promise.all([service.finish(row.id, { status: 'ACCEPTED', providerMessageId: randomUUID() }), service.finish(row.id, { status: 'FAILED', errorCategory: 'PROVIDER_REJECTED' })]);
    expect(results.filter(Boolean)).toHaveLength(1); const before = await db.emailLog.findUnique({ where: { id: row.id } });
    expect(await service.finish(row.id, { status: 'UNKNOWN', errorCategory: 'TIMEOUT' })).toBe(false);
    expect(JSON.stringify(await db.emailLog.findUnique({ where: { id: row.id } })) === JSON.stringify(before)).toBe(true);
  });
  test('Admin-only HTTP access, safe projections, filters and no retry endpoint', async () => {
    expect((await fetch(baseUrl)).status).toBe(401);
    const invalid = await fetch(baseUrl, { headers: { Authorization: 'Bearer synthetic-invalid-token' } });
    expect(invalid.status).toBe(401); expect((await invalid.json()).message).toBe('Authentication required');
    const { row } = await service.begin(input());
    for (const role of ['ADMIN', 'AGENT', 'USER']) {
      const id = randomUUID(); userIds.push(id);
      await db.user.create({ data: { id, name: 'Email log synthetic user', email: `email-log-it-${id}@example.test`, password: 'unused-fixture', role, emailVerified: true } });
      const token = require('../../../utils/jwt').signToken({ sub: id, role }); const headers = { Authorization: `Bearer ${token}` };
      const response = await fetch(`${baseUrl}?id=${row.id}`, { headers });
      expect(response.status).toBe(role === 'ADMIN' ? 200 : 403);
      const detail = await fetch(`${baseUrl}/${row.id}`, { headers }); expect(detail.status).toBe(role === 'ADMIN' ? 200 : 403);
      if (role === 'ADMIN') {
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const body = await response.json(); expect(body.data.logs).toHaveLength(1); expect(body.data.logs[0].recipientMasked).toBe('s***@e***.***');
        expect(body.data.logs[0]).not.toHaveProperty('idempotencyHash');
        expect(Object.keys(body.data.logs[0]).sort()).toEqual(Object.keys(service.select).sort());
        const day = row.createdAt.toISOString().slice(0, 10);
        const filtered = await fetch(`${baseUrl}?id=${row.id}&status=DISABLED&messageType=EMAIL_VERIFICATION&from=${day}&to=${day}&limit=1`, { headers });
        expect((await filtered.json()).data.logs).toHaveLength(1);
        for (const suffix of ['&status=ACCEPTED', '&limit=1&page=2']) {
          const empty = await fetch(`${baseUrl}?id=${row.id}${suffix}`, { headers }); expect((await empty.json()).data.logs).toHaveLength(0);
        }
        for (const q of ['limit=51', 'page=0', 'messageType=SECRET', 'from=2026-02-30', 'from=2026-02-02&to=2026-02-01']) expect((await fetch(`${baseUrl}?${q}`, { headers })).status).toBe(422);
        expect((await fetch(`${baseUrl}?status=DELIVERED`, { headers })).status).toBe(422);
        expect((await fetch(`${baseUrl}/${row.id}/retry`, { method: 'POST', headers })).status).toBe(404);
      }
    }
  });
});
