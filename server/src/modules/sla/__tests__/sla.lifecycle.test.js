jest.mock('../../../config/prisma', () => ({
  ticket: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  slaPolicy: { findFirst: jest.fn() },
  comment: { create: jest.fn() }, ticketHistory: { create: jest.fn(), createMany: jest.fn() },
  auditEvent: { create: jest.fn() }, user: { findMany: jest.fn(), findUnique: jest.fn() },
  ticketResolutionCycle: { create: jest.fn() },
  notification: { createMany: jest.fn() }, notificationPreference: { findMany: jest.fn() },
  ticketWatcher: { findMany: jest.fn() },
  $transaction: jest.fn(async (cb) => cb(require('../../../config/prisma'))),
}));
const db = require('../../../config/prisma');
const tickets = require('../../tickets/ticket.service');
const comments = require('../../comments/comment.service');
const { createSnapshot, milestone } = require('../sla.engine');
const { createTicketSchema, updateTicketSchema } = require('../../tickets/ticket.schema');
const origin = new Date('2026-09-09T00:00:00.000Z');
const policy = { id: 'policy', name: 'Test policy', firstResponseMinutes: 60, resolutionMinutes: 120, dueSoonMinutes: 15, isActive: true };
const admin = { id: 'admin', name: 'Admin', role: 'ADMIN' };
const agent = { id: 'agent', name: 'Agent', role: 'AGENT' };
const user = { id: 'requester', name: 'Requester', role: 'USER' };
let row;
const at = (minutes) => jest.setSystemTime(new Date(origin.getTime() + minutes * 60000));
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(origin);
  row = { id: 'ticket', status: 'IN_PROGRESS', priority: 'MEDIUM', createdAt: origin, updatedAt: origin, archivedAt: null, createdById: user.id, assignedToId: agent.id, slaVersion: 0, ...createSnapshot(policy, origin) };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  db.ticket.findUnique.mockImplementation(async () => ({ ...row }));
  db.ticket.findMany.mockImplementation(async () => [{ ...row }]);
  db.ticket.count.mockResolvedValue(1);
  db.ticket.updateMany.mockImplementation(async ({ data }) => {
    for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value?.increment ? (row[key] || 0) + value.increment : value;
    return { count: 1 };
  });
  db.ticket.create.mockImplementation(async ({ data }) => (row = { id: 'created', ...data }));
  db.slaPolicy.findFirst.mockResolvedValue(policy);
  db.comment.create.mockResolvedValue({ id: 'comment' });
  db.user.findMany.mockResolvedValue([]);
  db.notificationPreference.findMany.mockResolvedValue([]);
  db.ticketWatcher.findMany.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

test('new tickets snapshot server-selected priority; disabled policies produce no snapshot', async () => {
  const input = { title: 'Test ticket', description: 'Test description', priority: 'URGENT' };
  await tickets.createTicket(input, user);
  expect(db.slaPolicy.findFirst.mock.calls[0][0].where).toEqual({ priority: 'MEDIUM', isActive: true });
  expect(row.firstResponseDueAt).toEqual(new Date('2026-09-09T01:00:00Z'));
  db.slaPolicy.findFirst.mockResolvedValue(null);
  await tickets.createTicket(input, user);
  expect(row.slaPolicyId).toBeUndefined();
});
test.each(['firstResponseDueAt', 'slaPolicyId', 'resolutionCompletedAt', 'slaVersion'])('strict input rejects client-controlled %s', (field) => {
  expect(updateTicketSchema.safeParse({ [field]: 'forged' }).success).toBe(false);
  expect(createTicketSchema.safeParse({ title: 'Test ticket', description: 'Test description', [field]: 'forged' }).success).toBe(false);
});
test.each([[user, false], [agent, true], [admin, true]])('requester comments/internal notes do not complete response: %j internal=%s', async (actor, internal) => {
  at(10); await comments.addComment(row.id, { content: 'test comment', isInternal: internal }, actor);
  expect(row.firstRespondedAt).toBeUndefined();
});
test.each([agent, admin])('first public staff response is stable and preserves recorded breaches: %j', async (actor) => {
  row.firstResponseBreachedAt = new Date(origin.getTime() - 1000);
  at(20); await comments.addComment(row.id, { content: 'reply', isInternal: false }, actor);
  const responded = row.firstRespondedAt;
  at(30); await comments.addComment(row.id, { content: 'reply again', isInternal: false }, actor);
  expect(row.firstRespondedAt).toEqual(responded);
  expect(row.firstResponseBreachedAt).toEqual(new Date(origin.getTime() - 1000));
  expect(db.auditEvent.create.mock.calls[0][0].data.metadata.state).toBe('COMPLETED_BREACHED');
});
test('terminal replies do not fabricate missing first-response compliance', async () => {
  row.status = 'RESOLVED'; at(200);
  await comments.addComment(row.id, { content: 'late followup', isInternal: false }, agent);
  expect(row.firstRespondedAt).toBeUndefined();
});
test('only explicit requester waiting pauses resolution, and first-response never pauses', async () => {
  at(10); await tickets.updateTicket(row.id, { status: 'PENDING', pendingReason: 'OTHER' }, agent);
  expect(row.resolutionPausedAt).toBeUndefined();
  at(20); await tickets.updateTicket(row.id, { pendingReason: 'WAITING_FOR_REQUESTER' }, agent);
  at(300);
  expect(milestone(row, 'resolution').state).toBe('PAUSED');
  expect(milestone(row, 'firstResponse').state).toBe('BREACHED');
  await tickets.updateTicket(row.id, { status: 'IN_PROGRESS' }, agent);
  expect(row.pendingReason).toBeNull();
  expect(row.resolutionPausedAt).toBeNull();
  expect(row.resolutionDueAt).toEqual(new Date(origin.getTime() + 400 * 60000));
});
test.each([false, true])('priority while paused counts pause once; combined resume=%s', async (combined) => {
  at(10); await tickets.updateTicket(row.id, { status: 'PENDING', pendingReason: 'WAITING_FOR_REQUESTER' }, agent);
  db.slaPolicy.findFirst.mockResolvedValue({ ...policy, resolutionMinutes: 180 });
  at(20); await tickets.updateTicket(row.id, { priority: 'LOW', ...(combined ? { status: 'IN_PROGRESS' } : {}) }, agent);
  if (!combined) { at(30); await tickets.updateTicket(row.id, { status: 'IN_PROGRESS' }, agent); }
  expect(row.resolutionDueAt).toEqual(new Date(origin.getTime() + (combined ? 190 : 200) * 60000));
});
test('priority recalculation preserves completed milestones and previously detected breaches', async () => {
  row.firstRespondedAt = new Date(origin.getTime() + 60000);
  row.resolutionBreachedAt = new Date(origin.getTime() + 120 * 60000);
  const due = row.firstResponseDueAt;
  db.slaPolicy.findFirst.mockResolvedValue({ ...policy, firstResponseMinutes: 480, resolutionMinutes: 500 });
  at(200); await tickets.updateTicket(row.id, { priority: 'LOW' }, agent);
  expect(row.firstResponseDueAt).toEqual(due);
  expect(row.resolutionBreachedAt).toEqual(new Date(origin.getTime() + 120 * 60000));
  expect(milestone(row, 'resolution').state).toBe('BREACHED');
});
test('shortening a target while paused records a breach that a later extension cannot erase', async () => {
  at(30); await tickets.updateTicket(row.id, { status: 'PENDING', pendingReason: 'WAITING_FOR_REQUESTER' }, agent);
  db.slaPolicy.findFirst.mockResolvedValue({ ...policy, firstResponseMinutes: 10, resolutionMinutes: 20, dueSoonMinutes: 3 });
  at(40); await tickets.updateTicket(row.id, { priority: 'URGENT' }, agent);
  const breach = row.resolutionBreachedAt;
  expect(breach).toEqual(new Date(origin.getTime() + 20 * 60000));
  db.slaPolicy.findFirst.mockResolvedValue(policy);
  at(50); await tickets.updateTicket(row.id, { priority: 'MEDIUM' }, agent);
  expect(row.resolutionBreachedAt).toEqual(breach);
});
test('RESOLVED completes once, CLOSED preserves it, reopening retains cycle history', async () => {
  at(130); await tickets.updateTicket(row.id, { status: 'RESOLVED' }, agent);
  const completion = row.resolutionCompletedAt;
  at(140); await tickets.updateTicket(row.id, { status: 'CLOSED' }, agent);
  expect(row.resolutionCompletedAt).toEqual(completion);
  const firstBreach = row.firstResponseBreachedAt;
  at(150); await tickets.updateTicket(row.id, { status: 'OPEN' }, agent);
  expect(row.resolutionCompletedAt).toBeNull();
  expect(row.resolutionBreachedAt).toBeNull();
  expect(row.resolutionDueAt).toEqual(new Date(origin.getTime() + 270 * 60000));
  expect(row.firstResponseBreachedAt).toEqual(firstBreach);
  const history = db.ticketHistory.createMany.mock.calls.flatMap(([arg]) => arg.data);
  expect(history.filter((entry) => entry.description === 'SLA resolution completed')).toHaveLength(1);
  expect(history.find((entry) => entry.description === 'SLA resolution reopened').metadata.previousCompletionAt).toBe(completion.toISOString());
  expect(history.find((entry) => entry.description === 'SLA resolution breached').userId).toBeNull();
});
test('old tickets stay without SLA on update and requesters cannot set a pending reason', async () => {
  row.slaPolicyId = null;
  await tickets.updateTicket(row.id, { priority: 'HIGH' }, agent);
  expect(db.slaPolicy.findFirst).not.toHaveBeenCalled();
  await expect(tickets.updateTicket(row.id, { pendingReason: 'OTHER' }, user)).rejects.toMatchObject({ statusCode: 403 });
  expect((await tickets.getTicketById(row.id, agent)).sla).toBeNull();
});
test('requester and unassigned-agent responses contain no raw SLA fields; workflow reason survives for staff without SLA', async () => {
  row.history = [{ description: 'SLA resolution completed', metadata: { slaEvent: 'resolution completed', state: 'MET' } }, { description: 'SLA Team updated ticket details', metadata: null }];
  const response = await tickets.getTicketById(row.id, user);
  expect(response.history).toEqual([{ description: 'SLA Team updated ticket details', metadata: null }]);
  expect(response.firstResponseBreachedAt).toBeUndefined();
  expect(response.sla.resolution).toBeUndefined();
  expect(response.sla.firstResponse.state).toBeUndefined();
  row.assignedToId = null;
  const unassigned = await tickets.getTicketById(row.id, agent);
  expect(unassigned.sla).toBeNull();
  expect(unassigned.history).toEqual(response.history);
  row.slaPolicyId = null; row.pendingReason = 'OTHER';
  expect((await tickets.getTicketById(row.id, agent)).pendingReason).toBe('OTHER');
});
test('SLA filters are applied before pagination and agent-scoped; requester filters are rejected', async () => {
  const query = { page: 2, limit: 10, slaState: 'BREACHED' };
  await tickets.listTickets(agent, query);
  const where = db.ticket.findMany.mock.calls[0][0].where;
  expect(where.AND).toContainEqual({ assignedToId: agent.id });
  expect(JSON.stringify(where)).toContain('firstResponseBreachedAt');
  expect(db.ticket.count.mock.calls[0][0].where).toEqual(where);
  await expect(tickets.listTickets(user, query)).rejects.toMatchObject({ statusCode: 403 });
});
test('archived mutations fail before any write and stale updates return conflict', async () => {
  row.archivedAt = origin;
  await expect(tickets.updateTicket(row.id, { status: 'OPEN' }, admin)).rejects.toMatchObject({ statusCode: 409 });
  expect(db.ticket.updateMany).not.toHaveBeenCalled();
  row.archivedAt = null;
  db.ticket.updateMany.mockResolvedValue({ count: 0 });
  await expect(tickets.updateTicket(row.id, { priority: 'HIGH' }, admin)).rejects.toMatchObject({ statusCode: 409 });
});
