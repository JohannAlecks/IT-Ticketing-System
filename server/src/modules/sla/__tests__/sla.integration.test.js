// Explicitly gated: never migrates, runs a whole-database sweep, or touches
// non-fixture tickets. Run only after the SLA migration is approved/applied.
const { randomUUID } = require('crypto');
const enabled = process.env.RUN_SLA_DB_TESTS === 'true';
if (enabled && process.env.DATABASE_URL === 'postgresql://test:test@localhost:5432/test_db') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
}
function targetIsSafe() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return url.hostname === 'localhost' && (url.port || '5432') === '5432' && url.pathname === '/ticketing_db' && (url.searchParams.get('schema') || 'public') === 'public';
  } catch { return false; }
}
if (enabled && !targetIsSafe()) throw new Error('SLA database tests refused: target mismatch (credentials redacted)');
const describeDb = enabled ? describe : describe.skip;
describeDb('SLA local database integration (requires RUN_SLA_DB_TESTS=true)', () => {
  const db = require('../../../config/prisma');
  const { createSnapshot, slaFilterWhere } = require('../sla.engine');
  const { evaluateTicket } = require('../sla.sweep');
  const { addComment } = require('../../comments/comment.service');
  const { updateTicket } = require('../../tickets/ticket.service');
  const prefix = `sla-it-${randomUUID()}`;
  const ids = { users: [], tickets: [] };
  const origin = new Date('2026-01-01T00:00:00Z');
  const policy = { id: 'fixture-snapshot', name: 'Fixture', isActive: true, firstResponseMinutes: 60, resolutionMinutes: 120, dueSoonMinutes: 15 };
  let requester; let agent;
  async function makeUser(role, isActive = true) {
    const id = randomUUID(); ids.users.push(id);
    return db.user.create({ data: { id, name: `${prefix}-${role}`, email: `${prefix}-${id}@example.test`, password: 'unused-fixture', role, isActive, emailVerified: true } });
  }
  async function makeTicket(extra = {}) {
    const id = randomUUID(); ids.tickets.push(id);
    return db.ticket.create({ data: { id, title: `${prefix}-ticket`, description: 'SLA test fixture only.', status: 'IN_PROGRESS', priority: 'MEDIUM', isWorkBlocking: false, createdById: requester.id, assignedToId: agent.id, createdAt: origin, ...createSnapshot(policy, origin), ...extra } });
  }
  beforeAll(async () => {
    await db.$connect();
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20260905000000_add_sla_timers_escalation' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (applied.length !== 1) throw new Error('SLA migration must be applied before database tests');
    requester = await makeUser('USER'); agent = await makeUser('AGENT');
  });
  afterAll(async () => {
    try {
      await db.notification.deleteMany({ where: { OR: [{ ticketId: { in: ids.tickets } }, { recipientId: { in: ids.users } }] } });
      await db.auditEvent.deleteMany({ where: { OR: [{ entityType: 'ticket', entityId: { in: ids.tickets } }, { actorUserId: { in: ids.users } }] } });
      await db.ticketHistory.deleteMany({ where: { ticketId: { in: ids.tickets } } });
      await db.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
      await db.user.deleteMany({ where: { id: { in: ids.users } } });
      expect(await db.ticket.count({ where: { id: { in: ids.tickets } } })).toBe(0);
      expect(await db.user.count({ where: { id: { in: ids.users } } })).toBe(0);
      expect(await db.notification.count({ where: { OR: [{ ticketId: { in: ids.tickets } }, { recipientId: { in: ids.users } }] } })).toBe(0);
      expect(await db.auditEvent.count({ where: { entityId: { in: ids.tickets } } })).toBe(0);
      console.log('SLA fixture cleanup verified: tickets=0 users=0 notifications=0 audit=0');
    } finally { await db.$disconnect(); }
  });
  test('concurrent evaluations persist each breach/history/notification exactly once', async () => {
    const ticket = await makeTicket();
    const now = new Date('2026-01-01T03:00:00Z');
    const results = await Promise.all([evaluateTicket(ticket.id, now), evaluateTicket(ticket.id, now)]);
    expect(results.reduce((sum, result) => sum + result.breaches, 0)).toBe(2);
    expect(await db.notification.count({ where: { ticketId: ticket.id } })).toBe(2);
    expect(await db.ticketHistory.count({ where: { ticketId: ticket.id, userId: null } })).toBe(2);
    const saved = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved.updatedAt).toEqual(ticket.updatedAt);
    await evaluateTicket(ticket.id, now);
    expect(await db.notification.count({ where: { ticketId: ticket.id } })).toBe(2);
  });
  test('healthy and paused tickets receive no writes and filters agree with paused state', async () => {
    const ticket = await makeTicket({ firstRespondedAt: origin, status: 'PENDING', pendingReason: 'WAITING_FOR_REQUESTER', resolutionPausedAt: new Date('2026-01-01T00:30:00Z') });
    await evaluateTicket(ticket.id, new Date('2026-02-01T00:00:00Z'));
    expect((await db.ticket.findUnique({ where: { id: ticket.id } })).updatedAt).toEqual(ticket.updatedAt);
    expect(await db.ticketHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(await db.ticket.count({ where: { AND: [{ id: ticket.id }, slaFilterWhere('PAUSED', new Date('2026-02-01'))] } })).toBe(1);
  });
  test('preference opt-out suppresses due soon but never breach; inactive staff receive nothing', async () => {
    await db.notificationPreference.create({ data: { userId: agent.id, slaDueSoon: false } });
    const ticket = await makeTicket();
    await evaluateTicket(ticket.id, new Date('2026-01-01T00:50:00Z'));
    expect(await db.notification.count({ where: { ticketId: ticket.id } })).toBe(0);
    await evaluateTicket(ticket.id, new Date('2026-01-01T03:00:00Z'));
    expect(await db.notification.count({ where: { ticketId: ticket.id } })).toBe(2);
    const inactive = await makeUser('AGENT', false);
    const other = await makeTicket({ assignedToId: inactive.id });
    await evaluateTicket(other.id, new Date('2026-01-01T03:00:00Z'));
    expect(await db.notification.count({ where: { ticketId: other.id } })).toBe(0);
  });
  test('public staff reply completes once; internal/requester replies do not', async () => {
    const ticket = await makeTicket({ createdAt: new Date(), ...createSnapshot(policy, new Date()) });
    await addComment(ticket.id, { content: 'Fixture requester reply', isInternal: false }, requester);
    await addComment(ticket.id, { content: 'Fixture internal reply', isInternal: true }, agent);
    expect((await db.ticket.findUnique({ where: { id: ticket.id } })).firstRespondedAt).toBeNull();
    await addComment(ticket.id, { content: 'Fixture public reply', isInternal: false }, agent);
    const completed = (await db.ticket.findUnique({ where: { id: ticket.id } })).firstRespondedAt;
    await addComment(ticket.id, { content: 'Fixture second reply', isInternal: false }, agent);
    expect((await db.ticket.findUnique({ where: { id: ticket.id } })).firstRespondedAt).toEqual(completed);
  });
  test('resolution completion/reopen history survives and archived tickets are skipped', async () => {
    const ticket = await makeTicket();
    await updateTicket(ticket.id, { status: 'RESOLVED' }, agent);
    await updateTicket(ticket.id, { status: 'OPEN' }, agent);
    expect(await db.ticketHistory.count({ where: { ticketId: ticket.id, description: 'SLA resolution completed' } })).toBe(1);
    const archived = await makeTicket({ status: 'RESOLVED', archivedAt: new Date() });
    expect((await evaluateTicket(archived.id)).skipped).toBe(true);
  });
});
