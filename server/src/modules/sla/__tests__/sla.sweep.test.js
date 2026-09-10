jest.mock('../../../config/prisma', () => ({
  ticket: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  ticketHistory: { create: jest.fn() },
  auditEvent: { create: jest.fn() },
  user: { findMany: jest.fn() },
  notification: { createMany: jest.fn() },
  notificationPreference: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (callback) => callback(require('../../../config/prisma'))),
}));

const prisma = require('../../../config/prisma');
const { markBreach, runSweep, evaluateTicket, escalationEntries } = require('../sla.sweep');
const { createSnapshot } = require('../sla.engine');

const ticket = { id: 'ticket-1', status: 'OPEN', archivedAt: null, slaVersion: 7 };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
  prisma.ticketHistory.create.mockResolvedValue({});
  prisma.auditEvent.create.mockResolvedValue({});
  prisma.user.findMany.mockResolvedValue([]);
  prisma.notificationPreference.findMany.mockResolvedValue([]);
  prisma.notification.createMany.mockResolvedValue({ count: 0 });
});

const origin = new Date('2026-09-08T00:00:00Z');
const policy = { id: 'policy', name: 'Test', isActive: true, firstResponseMinutes: 60, resolutionMinutes: 120, dueSoonMinutes: 15 };
test('healthy tickets are row-locked then read and never written', async () => {
  prisma.ticket.findUnique.mockResolvedValue({ ...ticket, ...createSnapshot(policy, origin), updatedAt: origin });
  await evaluateTicket(ticket.id, new Date('2026-09-08T00:10:00Z'));
  expect(prisma.$queryRaw).toHaveBeenCalled();
  expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.ticket.findUnique.mock.invocationCallOrder[0]);
  expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  expect(prisma.ticketHistory.create).not.toHaveBeenCalled();
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
});
test('recorded breaches are not recorded again and first/resolution event keys remain distinct', async () => {
  const row = { ...ticket, ...createSnapshot(policy, origin), firstResponseBreachedAt: origin, resolutionBreachedAt: origin, assignedToId: 'staff' };
  prisma.ticket.findUnique.mockResolvedValue(row);
  prisma.user.findMany.mockResolvedValue([{ id: 'staff', role: 'AGENT' }]);
  await evaluateTicket(row.id, new Date('2026-09-08T03:00:00Z'));
  expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  const entries = prisma.notification.createMany.mock.calls[0][0].data;
  expect(entries).toHaveLength(2);
  expect(new Set(entries.map((entry) => entry.dedupeKey)).size).toBe(2);
  expect(prisma.notification.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
});
test('budget exhaustion returns a stable resume cursor and continuation skips earlier IDs', async () => {
  prisma.ticket.findMany.mockReset().mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]).mockResolvedValueOnce([{ id: 'c' }]);
  prisma.ticket.findUnique.mockResolvedValue(null);
  const first = await runSweep({ batchSize: 2, maxBatches: 1 });
  expect(first).toMatchObject({ bounded: true, nextCursor: 'b', scanned: 2 });
  const next = await runSweep({ batchSize: 2, maxBatches: 1, afterId: first.nextCursor });
  expect(prisma.ticket.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'b' });
  expect(next).toMatchObject({ bounded: false, nextCursor: null, scanned: 1 });
  await expect(runSweep({ afterId: 'invalid/cursor' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
});
test('resolution cycle changes dedupe keys while first-response keys stay stable', () => {
  const milestones = [{ kind: 'firstResponse', item: { state: 'BREACHED' } }, { kind: 'resolution', item: { state: 'BREACHED' } }];
  const first = escalationEntries({ ...ticket, resolutionCycleStartedAt: origin }, milestones, () => ['staff']);
  const next = escalationEntries({ ...ticket, resolutionCycleStartedAt: new Date('2026-09-09') }, milestones, () => ['staff']);
  expect(first[0].dedupeKey).toBe(next[0].dedupeKey);
  expect(first[1].dedupeKey).not.toBe(next[1].dedupeKey);
});
test('failed conditional breach gate never writes audit/history', async () => {
  prisma.ticket.updateMany.mockResolvedValue({ count: 0 });
  expect(await markBreach(prisma, ticket, 'resolution', origin)).toBe(false);
  expect(prisma.auditEvent.create).not.toHaveBeenCalled();
});
test('command error category cannot echo arbitrary error codes or messages', () => {
  const { safeErrorCategory } = require('../../../../scripts/sla-sweep');
  expect(safeErrorCategory({ code: 'PRIVATE_VALUE', message: 'private' })).toBe('SWEEP_FAILED');
  expect(safeErrorCategory({ code: 'P1001' })).toBe('P1001');
});

test('a conditional breach write uses the monotonic SLA token and records one actorless internal history event', async () => {
  await expect(markBreach(prisma, ticket, 'firstResponse', new Date('2026-09-08T01:00:00Z'))).resolves.toBe(true);
  expect(prisma.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ slaVersion: 7, firstResponseBreachedAt: null }), data: expect.objectContaining({ slaVersion: { increment: 1 } }) }));
  expect(prisma.ticketHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: null, metadata: expect.objectContaining({ visibility: 'internal', automated: true }) }) }));
});

test('the sweep uses bounded ID keysets rather than updatedAt rotation', async () => {
  prisma.ticket.findMany
    .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    .mockResolvedValueOnce([]);
  prisma.ticket.findUnique.mockResolvedValue(null);
  const result = await runSweep({ batchSize: 2, maxBatches: 2, now: new Date('2026-09-08T01:00:00Z') });
  expect(result).toMatchObject({ scanned: 2, processed: 0, skipped: 2 });
  expect(prisma.ticket.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' }, take: 2 });
  expect(prisma.ticket.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'b' });
});
