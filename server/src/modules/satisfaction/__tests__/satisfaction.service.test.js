jest.mock('../../../config/prisma', () => ({
  user: { findUnique: jest.fn() }, ticket: { findUnique: jest.fn() },
  ticketResolutionCycle: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  ticketSatisfaction: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  auditEvent: { create: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn(),
}));
jest.mock('../../notifications/notification.service', () => ({ writeNotifications: jest.fn(), eventEntry: (entry) => entry }));
const db = require('../../../config/prisma');
const notifications = require('../../notifications/notification.service');
const service = require('../satisfaction.service');
const { feedbackSchema, csatReportSchema } = require('../satisfaction.schema');
const { reportScope, aggregateResult } = require('../satisfaction.reports');
const now = new Date('2026-09-10T12:00:00Z');
const user = { id: 'requester', role: 'USER', isActive: true };
let ticket; let cycle;
beforeEach(() => {
  jest.resetAllMocks(); jest.useFakeTimers().setSystemTime(now);
  ticket = { id: 'ticket', createdById: user.id, status: 'RESOLVED', satisfactionCycleNumber: 1 };
  cycle = { id: 'cycle', number: 1, ticketId: ticket.id, requesterId: user.id, assignedAgentId: 'agent', resolvedAt: now, satisfaction: null };
  db.$transaction.mockImplementation((cb) => cb(db));
  db.$queryRaw.mockResolvedValue([{ now }]);
  db.user.findUnique.mockResolvedValue(user);
  db.ticket.findUnique.mockImplementation(async () => ticket);
  db.ticketResolutionCycle.findUnique.mockImplementation(async () => cycle);
  db.ticketResolutionCycle.findMany.mockImplementation(async () => [cycle]);
  db.ticketResolutionCycle.count.mockResolvedValue(1);
  db.ticketSatisfaction.updateMany.mockResolvedValue({ count: 1 });
  db.ticketSatisfaction.findUnique.mockResolvedValue({ id: 'feedback', rating: 5, comment: 'Thanks', version: 1 });
});
afterEach(() => jest.useRealTimers());
const save = (body = { rating: 5, comment: ' Thanks ' }, actor = user, update = false, etag = service.token(cycle)) => service.saveFeedback(ticket.id, body, actor, etag, update);

test.each([0, 6, 1.5, '5', null])('rejects invalid rating %s', (rating) => expect(feedbackSchema.safeParse({ rating }).success).toBe(false));
test.each(['requesterId', 'assignedAgentId', 'resolvedAt', 'resolutionCycle', 'status', 'version'])('rejects mass-assigned %s', (field) => expect(feedbackSchema.safeParse({ rating: 5, [field]: 'forged' }).success).toBe(false));
test('trims comments, converts blank to null, rejects oversized feedback and invalid filters', () => {
  expect(feedbackSchema.parse({ rating: 1, comment: '  ' }).comment).toBeNull();
  expect(feedbackSchema.parse({ rating: 5, comment: ' hi ' }).comment).toBe('hi');
  expect(feedbackSchema.safeParse({ rating: 5, comment: 'x'.repeat(1001) }).success).toBe(false);
  expect(csatReportSchema.safeParse({ rating: 6 }).success).toBe(false);
  expect(csatReportSchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
});
test.each(['RESOLVED', 'CLOSED'])('requester can rate %s including archived work', async (status) => {
  ticket.status = status; ticket.archivedAt = now;
  const result = await save(); expect(result.canWrite).toBe(true);
  expect(db.ticketSatisfaction.create).toHaveBeenCalledWith({ data: { cycleId: 'cycle', requesterId: user.id, rating: 5, comment: 'Thanks' } });
});
test.each(['OPEN', 'IN_PROGRESS', 'PENDING'])('active %s rejects feedback', async (status) => { ticket.status = status; await expect(save()).rejects.toMatchObject({ statusCode: 409 }); });
test.each(['AGENT', 'ADMIN'])('%s cannot impersonate requester', async (role) => { await expect(save(undefined, { ...user, role })).rejects.toMatchObject({ statusCode: 403 }); });
test('ownership and current account activity are checked after locks', async () => {
  ticket.createdById = 'other'; await expect(save()).rejects.toMatchObject({ statusCode: 404 });
  ticket.createdById = user.id; db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
  await expect(save()).rejects.toMatchObject({ statusCode: 403 });
  expect(db.ticketSatisfaction.create).not.toHaveBeenCalled();
});
test('missing precondition, duplicate submission, and stale cycle are rejected', async () => {
  await expect(save(undefined, user, false, '')).rejects.toMatchObject({ statusCode: 428 });
  await expect(save(undefined, user, false, 'old-cycle')).rejects.toMatchObject({ statusCode: 409 });
  cycle.satisfaction = { id: 'feedback', version: 1 };
  await expect(save()).rejects.toMatchObject({ statusCode: 409 });
});
test('update checks feedback version and does not notify again', async () => {
  cycle.satisfaction = { id: 'feedback', version: 3 };
  await save(undefined, user, true);
  expect(db.ticketSatisfaction.updateMany.mock.calls[0][0].where).toMatchObject({ requesterId: user.id, version: 3, cycleId: 'cycle' });
  expect(notifications.writeNotifications).not.toHaveBeenCalled();
  db.ticketSatisfaction.updateMany.mockResolvedValue({ count: 0 });
  await expect(save(undefined, user, true)).rejects.toMatchObject({ statusCode: 409 });
});
test('14-day boundary and expiry during write roll back with conflict', async () => {
  cycle.resolvedAt = new Date(now.getTime() - service.WINDOW_MS);
  await expect(save()).rejects.toMatchObject({ statusCode: 409 });
  cycle.resolvedAt = now; db.$queryRaw.mockResolvedValue([{ now: new Date(now.getTime() + service.WINDOW_MS) }]);
  await expect(save()).rejects.toMatchObject({ statusCode: 409 });
});
test('unique/serialization conflicts are safe 409s', async () => {
  db.ticketSatisfaction.create.mockRejectedValue({ code: 'P2002' }); await expect(save()).rejects.toMatchObject({ statusCode: 409 });
});
test('audit never includes private text; notification is generic and goes only to snapshot Agent', async () => {
  await save({ rating: 4, comment: 'private feedback' });
  expect(db.auditEvent.create.mock.calls[0][0].data.metadata).toEqual({ ticketId: 'ticket', resolutionCycle: 'cycle', rating: 4, hasComment: true });
  expect(JSON.stringify(notifications.writeNotifications.mock.calls)).not.toContain('private feedback');
  expect(notifications.writeNotifications.mock.calls[0][1].entries[0]).toMatchObject({ recipientId: 'agent', eventId: 'cycle', message: 'New satisfaction feedback was submitted for a resolved ticket.' });
  notifications.writeNotifications.mockClear(); cycle.assignedAgentId = null; await save(); expect(notifications.writeNotifications).not.toHaveBeenCalled();
});
test('history stays read-only after reopen and next cycle; staff never gets edit tokens', () => {
  ticket.status = 'OPEN'; expect(service.presentCycle(cycle, ticket, user, now)).toMatchObject({ canWrite: false, state: 'HISTORICAL' });
  ticket.status = 'RESOLVED'; ticket.satisfactionCycleNumber = 2;
  expect(service.presentCycle(cycle, ticket, user, now).canWrite).toBe(false);
  ticket.satisfactionCycleNumber = 1;
  expect(service.presentCycle(cycle, ticket, { id: 'agent', role: 'AGENT' }, now).editToken).toBeUndefined();
});
test('Agent reads only attributed cycles; unrelated Agent and requester receive 404', async () => {
  await service.getTicketSatisfaction('ticket', { id: 'agent', role: 'AGENT' });
  expect(db.ticketResolutionCycle.findMany.mock.calls[0][0].where).toEqual({ ticketId: 'ticket', assignedAgentId: 'agent' });
  db.ticketResolutionCycle.count.mockResolvedValue(0);
  await expect(service.getTicketSatisfaction('ticket', { id: 'other', role: 'AGENT' })).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.getTicketSatisfaction('ticket', { id: 'other', role: 'USER' })).rejects.toMatchObject({ statusCode: 404 });
});
test('resolution snapshots Agent and department, Admin completion is unattributed', async () => {
  db.user.findUnique.mockResolvedValueOnce({ department: ' IT ' }).mockResolvedValueOnce({ role: 'AGENT' });
  await service.recordResolution(db, { ...ticket, assignedToId: 'agent' }, { role: 'AGENT' }, now);
  expect(db.ticketResolutionCycle.create.mock.calls[0][0].data).toMatchObject({ number: 2, assignedAgentId: 'agent', departmentSnapshot: 'IT' });
  await service.recordResolution(db, ticket, { role: 'ADMIN' }, now);
  expect(db.ticketResolutionCycle.create.mock.calls[1][0].data.assignedAgentId).toBeNull();
});
test('report scope uses immutable attribution, forbids Agent peer filters and requester reporting', () => {
  expect(reportScope({ id: 'agent', role: 'AGENT' }).where.cycle).toEqual({ assignedAgentId: 'agent' });
  expect(() => reportScope({ id: 'agent', role: 'AGENT' }, { agentId: 'peer' })).toThrow();
  expect(() => reportScope(user)).toThrow();
  expect(reportScope({ role: 'ADMIN' }, { department: 'IT', rating: 5 }).where).toMatchObject({ cycle: { departmentSnapshot: 'IT' }, rating: 5 });
});
test('averages and distributions include only responses; empty average is null', () => {
  expect(aggregateResult({ _count: { _all: 2 }, _avg: { rating: 4.5 } }, [{ rating: 4, _count: { _all: 1 } }, { rating: 5, _count: { _all: 1 } }])).toMatchObject({ average: 4.5, responses: 2, distribution: { 1: 0, 4: 1, 5: 1 }, responseRate: null });
  expect(aggregateResult({ _count: { _all: 0 }, _avg: { rating: null } }, []).average).toBeNull();
});
