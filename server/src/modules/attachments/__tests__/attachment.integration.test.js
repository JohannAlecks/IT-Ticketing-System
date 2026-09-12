// Opt-in, local database only. All file operations target a newly created temp
// directory; all modified/deleted rows are IDs allocated by this suite.
const { randomUUID } = require('crypto');
const fs = require('fs'); const path = require('path');
const enabled = process.env.RUN_ATTACHMENT_DB_TESTS === 'true';
if (enabled && process.env.DATABASE_URL === 'postgresql://test:test@localhost:5432/test_db') require('dotenv').config({ path: path.join(__dirname, '../../../../.env'), override: true });
if (enabled) {
  const target = new URL(process.env.DATABASE_URL);
  if (target.hostname !== 'localhost' || (target.port || '5432') !== '5432' || target.pathname !== '/ticketing_db' || (target.searchParams.get('schema') || 'public') !== 'public') throw new Error('Attachment test target mismatch (redacted)');
  process.env.EMAIL_PROVIDER = 'disabled';
}
jest.mock('resend', () => ({ Resend: class { constructor() { throw new Error('Provider prohibited in attachment verification'); } } }));
jest.mock('../attachment.storage', () => {
  const actual = jest.requireActual('../attachment.storage');
  if (process.env.RUN_ATTACHMENT_DB_TESTS !== 'true') return actual;
  const fs = require('fs'); const path = require('path'); const os = require('os');
  return { ...actual, store: actual.createStore(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-attachment-test-'))) };
});

(enabled ? describe : describe.skip)('Attachment database and synthetic-storage integrity', () => {
  const db = require('../../../config/prisma');
  const service = require('../attachment.service'); const ticketsService = require('../../tickets/ticket.service');
  const { store } = require('../attachment.storage'); const { scanOrphans, lockStorage } = require('../attachment.cleanup');
  const users = [], tickets = [], attachments = []; const prefix = `attachment-it-${randomUUID()}`;
  let owner, admin, outsider, failHistoryFor;
  db.$use((params, next) => {
    if (failHistoryFor && params.model === 'TicketHistory' && params.action === 'create' && params.args.data.ticketId === failHistoryFor && params.args.data.action === 'ATTACHMENT_DELETED') throw new Error('Synthetic private database failure');
    return next(params);
  });
  async function user(role) { const id = randomUUID(); users.push(id); return db.user.create({ data: { id, name: prefix, email: `${id}@example.test`, password: 'unused-fixture', role, emailVerified: true } }); }
  async function ticket(extra = {}) { const id = randomUUID(); tickets.push(id); return db.ticket.create({ data: { id, title: prefix, description: 'Synthetic attachment test', createdById: owner.id, ...extra } }); }
  async function upload(t, who = owner) {
    const storagePath = `${randomUUID()}.txt`; const filePath = store.resolve(storagePath); fs.writeFileSync(filePath, 'synthetic attachment fixture');
    const row = await service.uploadAttachment(t.id, { path: filePath, originalname: 'synthetic.txt', mimetype: 'text/plain', size: 28 }, who);
    attachments.push(row.id); return row;
  }
  const scan = (extra = {}) => scanOrphans({ prisma: db, store, now: new Date(Date.now() + 48 * 3600000), execute: true, writersStopped: true, ...extra });
  beforeAll(async () => { owner = await user('USER'); admin = await user('ADMIN'); outsider = await user('USER'); });
  afterEach(() => { failHistoryFor = null; jest.restoreAllMocks(); });
  afterAll(async () => {
    try {
      await db.ticket.deleteMany({ where: { id: { in: tickets } } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { entityId: { in: attachments } }] } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      expect(await db.ticket.count({ where: { id: { in: tickets } } })).toBe(0);
      expect(await db.ticketAttachment.count({ where: { id: { in: attachments } } })).toBe(0);
      expect(await db.ticketHistory.count({ where: { ticketId: { in: tickets } } })).toBe(0);
      expect(await db.auditEvent.count({ where: { actorUserId: { in: users } } })).toBe(0);
      expect(await db.user.count({ where: { id: { in: users } } })).toBe(0);
      console.log('Attachment fixture cleanup: users/tickets/attachments/history/audits=0');
    } finally {
      await db.$disconnect();
      if (path.dirname(store.root) !== fs.realpathSync(require('os').tmpdir()) || !path.basename(store.root).startsWith('ticketing-attachment-test-') || fs.lstatSync(store.root).isSymbolicLink()) throw new Error('Unsafe synthetic root');
      fs.rmSync(store.root, { recursive: true, force: true });
      expect(fs.existsSync(store.root)).toBe(false);
      console.log('Synthetic attachment directory removed');
    }
  });
  test('authorized deletion commits metadata/history before storage removal', async () => {
    const t = await ticket(); const a = await upload(t);
    const original = store.remove; let observed = false;
    jest.spyOn(store, 'remove').mockImplementation(async (...args) => {
      expect(await db.ticketAttachment.findUnique({ where: { id: a.id } })).toBeNull();
      expect(await db.ticketHistory.count({ where: { ticketId: t.id, action: 'ATTACHMENT_DELETED' } })).toBe(1);
      observed = true; return original(...args);
    });
    await service.deleteAttachment(t.id, a.id, owner); expect(observed).toBe(true);
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(false);
  });
  test('unauthorized deletion and archive rejection preserve rows and files; archived downloads remain available', async () => {
    const t = await ticket(); const a = await upload(t);
    await expect(service.deleteAttachment(t.id, a.id, outsider)).rejects.toMatchObject({ statusCode: 403 });
    await db.ticket.update({ where: { id: t.id }, data: { status: 'CLOSED', archivedAt: new Date(), archivedById: admin.id } });
    await expect(service.deleteAttachment(t.id, a.id, admin)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.getAttachmentForDownload(t.id, a.id, owner)).attachment.id).toBe(a.id);
    expect(await scan()).toMatchObject({ quarantined: 0 });
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(true);
  });
  test('history failure rolls the entire transaction back and API returns sanitized 503', async () => {
    const t = await ticket(); const a = await upload(t); const before = await db.ticket.findUnique({ where: { id: t.id } });
    const audits = await db.auditEvent.count({ where: { actorUserId: owner.id } }); failHistoryFor = t.id;
    const express = require('express'); const app = express();
    app.delete('/:ticketId/:attachmentId', (req, res, next) => { req.user = owner; next(); }, require('../attachment.controller').deleteAttachment);
    app.use(require('../../../middleware/errorHandler'));
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
      const response = await fetch(`http://127.0.0.1:${server.address().port}/${t.id}/${a.id}`, { method: 'DELETE' });
      expect(response.status).toBe(503); const body = await response.json();
      expect(body.message).toBe('Attachment could not be deleted'); expect(body).not.toHaveProperty('stack');
      expect(JSON.stringify(body)).not.toMatch(/Prisma|Postgres|Synthetic|uploads|[A-Z]:\\/);
    } finally { await new Promise((resolve) => server.close(resolve)); }
    expect(await db.ticket.findUnique({ where: { id: t.id } })).toEqual(before);
    expect(await db.ticketAttachment.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await db.ticketHistory.count({ where: { ticketId: t.id, action: 'ATTACHMENT_DELETED' } })).toBe(0);
    expect(await db.auditEvent.count({ where: { actorUserId: owner.id } })).toBe(audits);
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(true);
  });
  test('shared storage filename stays intact while an archived reference survives', async () => {
    const t = await ticket(); const archived = await ticket({ archivedAt: new Date(), status: 'CLOSED', archivedById: admin.id }); const a = await upload(t);
    const id = randomUUID(); attachments.push(id);
    await db.ticketAttachment.create({ data: { id, ticketId: archived.id, uploadedById: owner.id, storagePath: a.storagePath, originalFileName: 'synthetic.txt', mimeType: 'text/plain', fileSize: 28 } });
    await service.deleteAttachment(t.id, a.id, owner);
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(true);
    expect(await scan()).toMatchObject({ quarantined: 0 });
    expect(await db.ticketAttachment.findUnique({ where: { id } })).not.toBeNull();
  });
  test('post-commit filesystem failure leaves a safe audit and is recoverable through quarantine', async () => {
    const t = await ticket(); const a = await upload(t); jest.spyOn(store, 'remove').mockRejectedValueOnce(new Error('sensitive physical path'));
    await expect(service.deleteAttachment(t.id, a.id, owner)).rejects.toMatchObject({ statusCode: 503 });
    expect(await db.ticketAttachment.findUnique({ where: { id: a.id } })).toBeNull();
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(true);
    const audit = await db.auditEvent.findFirst({ where: { entityId: a.id, eventType: 'attachment.cleanup_failed' } });
    expect(audit.metadata).toMatchObject({ category: 'STORAGE_CLEANUP_INCOMPLETE', recovery: 'ORPHAN_SCAN' });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/sensitive|physical|storagePath/);
    expect(await scan()).toMatchObject({ quarantined: 1, exitCode: 0 });
    expect(await scan()).toMatchObject({ quarantined: 0, exitCode: 0 });
  });
  test('existing permanent-ticket deletion cascades metadata then removes only unreferenced files', async () => {
    const t = await ticket(); const a = await upload(t);
    await ticketsService.deleteTicket(t.id, { actorUserId: admin.id });
    expect(await db.ticket.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await db.ticketAttachment.findUnique({ where: { id: a.id } })).toBeNull();
    expect(fs.existsSync(store.resolve(a.storagePath))).toBe(false);
  });
  test('missing eligible file is idempotent after metadata deletion', async () => {
    const t = await ticket(); const a = await upload(t); await fs.promises.unlink(store.resolve(a.storagePath));
    await expect(service.deleteAttachment(t.id, a.id, owner)).resolves.toBeUndefined();
    expect(await db.ticketAttachment.findUnique({ where: { id: a.id } })).toBeNull();
  });
  test('advisory coordination protects a concurrent publication before scanner mutation', async () => {
    const t = await ticket(); const storagePath = `${randomUUID()}.txt`; fs.writeFileSync(store.resolve(storagePath), 'synthetic');
    let locked, release; const acquired = new Promise((r) => { locked = r; }); const gate = new Promise((r) => { release = r; });
    const id = randomUUID(); attachments.push(id);
    const publishing = db.$transaction(async (tx) => {
      await lockStorage(tx); locked(); await gate;
      await tx.ticketAttachment.create({ data: { id, ticketId: t.id, uploadedById: owner.id, storagePath, originalFileName: 'synthetic.txt', mimeType: 'text/plain', fileSize: 9 } });
    }, { timeout: 15000 });
    await acquired;
    try {
      const canLock = await db.$transaction((tx) => tx.$queryRaw`SELECT pg_try_advisory_xact_lock(73521, 3) AS acquired`);
      expect(canLock[0].acquired).toBe(false);
      let entered; const entering = new Promise((r) => { entered = r; });
      const scanning = scan({ prisma: { ticketAttachment: db.ticketAttachment, auditEvent: db.auditEvent,
        $transaction: (callback) => { entered(); return db.$transaction(callback); } } });
      await entering; release(); await publishing;
      expect(await scanning).toMatchObject({ quarantined: 0, exitCode: 0 });
      expect(fs.existsSync(store.resolve(storagePath))).toBe(true);
    } finally { release(); await publishing; }
  });
});
