// Opt in only after explicit migration approval. Never migrates/resets or
// touches non-fixture tickets. Cleanup is scoped to UUIDs created by this suite.
const { randomUUID } = require('crypto');
const { enabled, describeDb } = require('../../../../testUtils/databaseSuite');
const skipReason = 'requires the centralized dedicated test-database guard';
(enabled ? describe : describe.skip)('CSAT local database integration', () => {
  const db = require('../../../config/prisma');
  const service = require('../satisfaction.service');
  const tickets = require('../../tickets/ticket.service');
  const users = require('../../users/user.service');
  const { report } = require('../satisfaction.reports');
  const prefix = `csat-it-${randomUUID()}`;
  const ids = { users: [], tickets: [], cycles: [] };
  let requester; let agent; let admin; let peer;
  async function makeUser(role) {
    const id = randomUUID(); ids.users.push(id);
    return db.user.create({ data: { id, name: `${prefix}-${role}`, email: `${prefix}-${id}@example.test`, password: 'unused-test-fixture', role, department: prefix } });
  }
  async function completed() {
    const id = randomUUID(); ids.tickets.push(id);
    await db.ticket.create({ data: { id, title: prefix, description: 'Isolated CSAT fixture', createdById: requester.id, assignedToId: agent.id, status: 'IN_PROGRESS' } });
    await tickets.updateTicket(id, { status: 'RESOLVED' }, agent);
    const cycle = await db.ticketResolutionCycle.findUnique({ where: { ticketId_number: { ticketId: id, number: 1 } } });
    ids.cycles.push(cycle.id);
    return { id, cycle, token: service.token({ ...cycle, satisfaction: null }) };
  }
  beforeAll(async () => {
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20260910000000_add_ticket_satisfaction' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (applied.length !== 1) throw new Error('CSAT migration must be applied exactly once before DB tests');
    requester = await makeUser('USER'); agent = await makeUser('AGENT'); admin = await makeUser('ADMIN'); peer = await makeUser('AGENT');
  });
  afterAll(async () => {
    try {
      const cycles = await db.ticketResolutionCycle.findMany({ where: { ticketId: { in: ids.tickets } }, select: { id: true } });
      const cycleIds = cycles.map((c) => c.id);
      await db.notification.deleteMany({ where: { OR: [{ ticketId: { in: ids.tickets } }, { recipientId: { in: ids.users } }] } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids.users } }, { entityId: { in: [...ids.tickets, ...cycleIds, ...ids.users] } }] } });
      await db.ticketSatisfaction.deleteMany({ where: { cycleId: { in: cycleIds } } });
      await db.ticketResolutionCycle.deleteMany({ where: { ticketId: { in: ids.tickets } } });
      await db.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
      await db.user.deleteMany({ where: { id: { in: ids.users } } });
      const remaining = await Promise.all([
        db.ticket.count({ where: { id: { in: ids.tickets } } }), db.user.count({ where: { id: { in: ids.users } } }),
        db.ticketResolutionCycle.count({ where: { id: { in: cycleIds } } }), db.ticketSatisfaction.count({ where: { cycleId: { in: cycleIds } } }),
        db.notification.count({ where: { ticketId: { in: ids.tickets } } }), db.auditEvent.count({ where: { entityId: { in: [...ids.tickets, ...cycleIds, ...ids.users] } } }),
      ]);
      expect(remaining).toEqual([0, 0, 0, 0, 0, 0]); console.log('CSAT fixture cleanup verified: tickets/users/cycles/feedback/notifications/audit=0');
    } finally { await db.$disconnect(); }
  });
  test('concurrent submissions and updates create one feedback and reject stale writes', async () => {
    const t = await completed();
    const results = await Promise.allSettled([1, 2].map(() => service.saveFeedback(t.id, { rating: 5 }, requester, t.token, false)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
    expect(await db.ticketSatisfaction.count({ where: { cycleId: t.cycle.id } })).toBe(1);
    const token = results.find((r) => r.status === 'fulfilled').value.editToken;
    const updates = await Promise.allSettled([3, 4].map((rating) => service.saveFeedback(t.id, { rating }, requester, token, true)));
    expect(updates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.notification.count({ where: { ticketId: t.id, type: 'TICKET_SATISFACTION_RECEIVED' } })).toBe(1);
  });
  test('reopen preserves prior feedback and new resolution creates a distinct eligible cycle', async () => {
    const t = await completed(); await service.saveFeedback(t.id, { rating: 2, comment: 'First cycle' }, requester, t.token, false);
    await tickets.updateTicket(t.id, { status: 'OPEN' }, agent);
    await expect(service.saveFeedback(t.id, { rating: 5 }, requester, t.token, true)).rejects.toMatchObject({ statusCode: 409 });
    await tickets.updateTicket(t.id, { status: 'IN_PROGRESS' }, agent); await tickets.updateTicket(t.id, { status: 'RESOLVED' }, agent);
    const latest = (await service.getTicketSatisfaction(t.id, requester)).cycles[0];
    expect(latest.number).toBe(2); await service.saveFeedback(t.id, { rating: 5 }, requester, latest.editToken, false);
    expect(await db.ticketSatisfaction.count({ where: { cycle: { ticketId: t.id } } })).toBe(2);
  });
  test('archive and reassignment preserve eligibility and immutable Agent attribution', async () => {
    const t = await completed(); await tickets.assignTicket(t.id, peer.id, admin); await tickets.archiveTicket(t.id, admin);
    await service.saveFeedback(t.id, { rating: 4 }, requester, t.token, false);
    expect((await db.ticketResolutionCycle.findUnique({ where: { id: t.cycle.id } })).assignedAgentId).toBe(agent.id);
    await expect(service.getTicketSatisfaction(t.id, peer)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.getTicketSatisfaction(t.id, agent)).cycles).toHaveLength(1);
  });
  test('expiry and inactive requester are rejected; inactive Agent receives no CSAT alert', async () => {
    const t = await completed();
    await db.ticketResolutionCycle.update({ where: { id: t.cycle.id }, data: { resolvedAt: new Date(Date.now() - service.WINDOW_MS - 1000) } });
    await expect(service.saveFeedback(t.id, { rating: 5 }, requester, t.token, false)).rejects.toMatchObject({ statusCode: 409 });
    const other = await completed(); await db.user.update({ where: { id: requester.id }, data: { isActive: false } });
    await expect(service.saveFeedback(other.id, { rating: 5 }, requester, other.token, false)).rejects.toMatchObject({ statusCode: 403 });
    await db.user.update({ where: { id: requester.id }, data: { isActive: true } });
    await db.user.update({ where: { id: agent.id }, data: { isActive: false } });
    await service.saveFeedback(other.id, { rating: 5 }, requester, other.token, false);
    expect(await db.notification.count({ where: { ticketId: other.id, type: 'TICKET_SATISFACTION_RECEIVED' } })).toBe(0);
    await db.user.update({ where: { id: agent.id }, data: { isActive: true } });
  });
  test('feedback racing reopening remains historical or is rejected', async () => {
    const t = await completed();
    const result = await Promise.allSettled([service.saveFeedback(t.id, { rating: 5 }, requester, t.token, false), tickets.updateTicket(t.id, { status: 'OPEN' }, agent)]);
    expect(result[1].status).toBe('fulfilled');
    expect((await service.getTicketSatisfaction(t.id, requester)).cycles[0].canWrite).toBe(false);
    expect(await db.ticketSatisfaction.count({ where: { cycleId: t.cycle.id } })).toBeLessThanOrEqual(1);
  });
  test('deactivation serializes with requester submission; no writes after deactivation', async () => {
    const t = await completed();
    const result = await Promise.allSettled([service.saveFeedback(t.id, { rating: 4 }, requester, t.token, false), users.setUserActive(requester.id, false, admin)]);
    if (result[1].status === 'rejected' && result[1].reason.code === 'P2034') await users.setUserActive(requester.id, false, admin);
    expect((await db.user.findUnique({ where: { id: requester.id } })).isActive).toBe(false);
    await expect(service.saveFeedback(t.id, { rating: 1 }, requester, t.token, true)).rejects.toMatchObject({ statusCode: 403 });
    await db.user.update({ where: { id: requester.id }, data: { isActive: true } });
  });
  test('reports safely filter snapshots and aggregate in PostgreSQL', async () => {
    const data = await report(admin, { department: prefix });
    expect(data.responses).toBeGreaterThan(0); expect(data.average).toBeGreaterThanOrEqual(1);
    expect(Object.values(data.distribution).reduce((a, b) => a + b, 0)).toBe(data.responses);
    expect(JSON.stringify(data)).not.toContain('@example.test');
    expect(data.trend.length).toBeGreaterThan(0);
    const personal = await report(agent); expect(personal.feedback.every((f) => !('assignedAgent' in f.cycle))).toBe(true);
  });
});
