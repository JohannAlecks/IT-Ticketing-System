jest.mock('../../../config/prisma', () => ({
  ticket: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  ticketHistory: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  userOnboarding: { findUnique: jest.fn() },
  auditEvent: { findMany: jest.fn() },
}));

const prisma = require('../../../config/prisma');
const dashboardService = require('../dashboard.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.ticket.count.mockResolvedValue(0);
  prisma.ticket.groupBy.mockResolvedValue([]);
  prisma.ticket.findMany.mockResolvedValue([]);
  prisma.ticketHistory.findMany.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([]);
  prisma.user.count.mockResolvedValue(0);
  prisma.userOnboarding.findUnique.mockResolvedValue(null);
  prisma.auditEvent.findMany.mockResolvedValue([]);
  jest.useFakeTimers().setSystemTime(new Date('2026-08-30T00:00:00.000Z'));
});

afterEach(() => jest.useRealTimers());

test('USER dashboard activity is ticket-scoped and excludes internal-note history', async () => {
  await dashboardService.getStats({ id: 'user-1', role: 'USER' });

  expect(prisma.ticketHistory.findMany).toHaveBeenCalledTimes(1);
  expect(prisma.ticketHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      ticket: { createdById: 'user-1' },
      NOT: { description: { contains: 'internal note' } },
    },
  }));
});

test('staff dashboard activity keeps complete history visibility', async () => {
  await dashboardService.getStats({ id: 'admin-1', role: 'ADMIN' });

  expect(prisma.ticketHistory.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
    where: { ticket: {} },
  }));
});

test('AGENT personal activity cannot reveal tickets assigned to someone else', async () => {
  await dashboardService.getStats({ id: 'agent-1', role: 'AGENT' });

  expect(prisma.ticketHistory.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
    where: {
      userId: 'agent-1',
      ticket: { OR: [{ assignedToId: 'agent-1' }, { assignedToId: null }] },
    },
  }));
});

test('USER summary is owner-scoped, has explicit empty state defaults, and uses safe ticket fields', async () => {
  const summary = await dashboardService.getSummary({ id: 'user-1', role: 'USER' });

  expect(summary).toEqual(expect.objectContaining({
    role: 'USER',
    generatedAt: '2026-08-30T00:00:00.000Z',
    windowDays: 7,
    definitions: { activeStatuses: ['OPEN', 'IN_PROGRESS', 'PENDING'], terminalStatuses: ['RESOLVED', 'CLOSED'] },
    metrics: { active: 0, workBlocking: 0, recentlyCreated: 0, recentlyClosed: 0 },
    distributions: { byStatus: { OPEN: 0, IN_PROGRESS: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 } },
    lists: { active: [], recent: [], recentClosed: [] },
    onboarding: { completedSteps: [], dismissedAt: null, completedAt: null },
  }));
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(1, {
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] }, createdById: 'user-1' },
  });
  expect(prisma.ticket.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] }, createdById: 'user-1' },
    select: expect.objectContaining({ id: true, title: true, closedAt: true, assignedTo: { select: { id: true, name: true } } }),
  }));
  const select = prisma.ticket.findMany.mock.calls[0][0].select;
  expect(select).not.toHaveProperty('description');
  expect(select).not.toHaveProperty('createdBy');
  expect(select).not.toHaveProperty('category');
  expect(select).not.toHaveProperty('isWorkBlocking');
  expect(select.assignedTo.select).not.toHaveProperty('email');
  expect(prisma.ticket.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
    where: { status: 'CLOSED', closedAt: { gte: new Date('2026-08-23T00:00:00.000Z') }, createdById: 'user-1' },
    orderBy: { closedAt: 'desc' },
  }));
  expect(prisma.ticket.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
    where: { createdById: 'user-1', updatedAt: { gte: new Date('2026-08-23T00:00:00.000Z') } },
  }));
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(4, expect.objectContaining({
    where: { status: 'CLOSED', closedAt: { gte: new Date('2026-08-23T00:00:00.000Z') }, createdById: 'user-1' },
  }));
  expect(prisma.userOnboarding.findUnique).toHaveBeenCalledWith({
    where: { userId: 'user-1' }, select: { completedSteps: true, dismissedAt: true, completedAt: true },
  });
});

test('AGENT summary includes only self-assigned work plus eligible unassigned tickets without peer data', async () => {
  const summary = await dashboardService.getSummary({ id: 'agent-1', role: 'AGENT' });

  expect(summary.metrics).toEqual({ assignedActive: 0, assignedWorkBlocking: 0, eligibleUnassigned: 0, recentlyUpdatedAssigned: 0, recentlyClosedByMe: 0 });
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(1, {
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] }, assignedToId: 'agent-1' },
  });
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(3, {
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] }, assignedToId: null },
  });
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(5, expect.objectContaining({
    where: { status: 'CLOSED', closedAt: { gte: new Date('2026-08-23T00:00:00.000Z') }, assignedToId: 'agent-1' },
  }));
  expect(prisma.ticket.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] }, assignedToId: null },
  }));
  expect(prisma.ticket.findMany.mock.calls[1][0].select).not.toHaveProperty('createdBy');
  expect(prisma.ticket.count).toHaveBeenNthCalledWith(4, {
    where: { assignedToId: 'agent-1', updatedAt: { gte: new Date('2026-08-23T00:00:00.000Z') } },
  });
  expect(prisma.ticket.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
    where: { assignedToId: 'agent-1', updatedAt: { gte: new Date('2026-08-23T00:00:00.000Z') } },
  }));
});

test('ADMIN summary excludes inactive agents from workload, batches active counts, and safely selects audit events', async () => {
  prisma.ticket.groupBy
    .mockResolvedValueOnce([{ status: 'OPEN', _count: { _all: 3 } }])
    .mockResolvedValueOnce([{ category: 'VPN', _count: { _all: 2 } }])
    .mockResolvedValueOnce([{ createdById: 'requester-1', _count: { _all: 2 } }])
    .mockResolvedValueOnce([
      { assignedToId: 'agent-active', status: 'OPEN', _count: { _all: 2 } },
      { assignedToId: 'agent-active', status: 'PENDING', _count: { _all: 1 } },
    ]);
  prisma.user.findMany
    .mockResolvedValueOnce([
      { id: 'agent-active', name: 'Active Agent', department: 'IT', role: 'AGENT', isActive: true },
      { id: 'requester-1', name: 'Requester', department: null, role: 'USER', isActive: true },
    ]);

  const summary = await dashboardService.getSummary({ id: 'admin-1', role: 'ADMIN' });

  expect(summary.distributions.byStatus).toEqual({ OPEN: 3, IN_PROGRESS: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 });
  expect(summary.distributions.byCategory.VPN).toBe(2);
  expect(summary.distributions.byDepartment).toEqual({ Unknown: 2 });
  expect(summary.lists.workload).toEqual([{
    agent: { id: 'agent-active', name: 'Active Agent' },
    total: 3,
    byStatus: { OPEN: 2, IN_PROGRESS: 0, PENDING: 1 },
  }]);
  expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  expect(prisma.user.findMany).toHaveBeenCalledWith({
    where: { OR: [{ id: { in: ['requester-1'] } }, { role: 'AGENT', isActive: true }] },
    select: { id: true, name: true, department: true, role: true, isActive: true }, orderBy: { name: 'asc' },
  });
  expect(prisma.ticket.groupBy).toHaveBeenNthCalledWith(4, {
    by: ['assignedToId', 'status'], where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] } }, _count: { _all: true },
  });
  expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
    select: { id: true, eventType: true, entityType: true, entityId: true, createdAt: true, actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }, take: 8,
  });
  const auditSelect = prisma.auditEvent.findMany.mock.calls[0][0].select;
  expect(auditSelect).not.toHaveProperty('metadata');
  expect(auditSelect).not.toHaveProperty('requestId');
  expect(auditSelect.actor.select).not.toHaveProperty('email');
});
