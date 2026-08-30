jest.mock('../../../config/prisma', () => ({
  ticket: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  ticketHistory: { count: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
}));

const prisma = require('../../../config/prisma');
const AppError = require('../../../utils/AppError');
const { exportQuerySchema, reportQuerySchema, ticketQuerySchema } = require('../report.schema');
const reportService = require('../report.service');

const AGENT = { id: '11111111-1111-4111-8111-111111111111', role: 'AGENT' };
const ADMIN = { id: '22222222-2222-4222-8222-222222222222', role: 'ADMIN' };
const OTHER_AGENT = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
  prisma.ticket.count.mockResolvedValue(0);
  prisma.ticket.groupBy.mockResolvedValue([]);
  prisma.ticket.findMany.mockResolvedValue([]);
  prisma.ticketHistory.count.mockResolvedValue(0);
  prisma.ticketHistory.findMany.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([]);
});

afterEach(() => jest.useRealTimers());

test('query schemas enforce strict valid UTC calendar dates and pagination bounds', () => {
  expect(reportQuerySchema.safeParse({ from: '2026-02-28', to: '2026-03-01' }).success).toBe(true);
  expect(reportQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
  expect(reportQuerySchema.safeParse({ from: '2026/02/28' }).success).toBe(false);
  expect(reportQuerySchema.safeParse({ unexpected: 'nope' }).success).toBe(false);
  expect(ticketQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  expect(ticketQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(exportQuerySchema.safeParse({ sortOrder: 'asc' }).success).toBe(true);
  expect(exportQuerySchema.safeParse({ page: 1 }).success).toBe(false);
});

test('normalizes a 30-day UTC default, rejects reversed/excessive dates, and defends service roles', () => {
  expect(reportService.normalizeFilters(AGENT, {}, new Date('2026-08-30T23:00:00.000Z'))).toMatchObject({
    filters: { from: '2026-08-01', to: '2026-08-30', interval: 'day', workBlocking: 'all' },
    range: { days: 30 },
  });
  expect(() => reportService.normalizeFilters(AGENT, { from: '2026-08-31', to: '2026-08-30' })).toThrow(AppError);
  expect(() => reportService.normalizeFilters(AGENT, { from: '2025-01-01', to: '2026-08-30' })).toThrow(AppError);
  expect(() => reportService.normalizeFilters(AGENT, { from: '2026-02-30' })).toThrow(AppError);
  expect(() => reportService.normalizeFilters({ id: 'user-1', role: 'USER' }, {})).toThrow(AppError);
});

test('Agent filters ignore admin-only scope fields and every ticket query remains self-assigned', async () => {
  await reportService.listTickets(AGENT, {
    from: '2026-08-01', to: '2026-08-30', page: 2, limit: 10, sortOrder: 'asc',
    agentId: OTHER_AGENT, department: 'Finance', status: 'OPEN', category: 'VPN', priority: 'HIGH', workBlocking: 'yes', search: ' vpn ',
  });

  const call = prisma.ticket.findMany.mock.calls[0][0];
  expect(call.where).toEqual({
    AND: [
      { assignedToId: AGENT.id }, { status: 'OPEN' }, { category: 'VPN' }, { priority: 'HIGH' }, { isWorkBlocking: true },
      { title: { contains: 'vpn', mode: 'insensitive' } }, { createdAt: { gte: new Date('2026-08-01T00:00:00.000Z'), lt: new Date('2026-08-31T00:00:00.000Z') } },
    ],
  });
  expect(call.where).not.toEqual(expect.objectContaining({ assignedToId: OTHER_AGENT }));
  expect(call.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  expect(call.skip).toBe(10);
  expect(call.take).toBe(10);
});

test('Admin ticket predicates combine authorized agent and requester department dimensions with created dates', async () => {
  await reportService.listTickets(ADMIN, {
    from: '2026-08-01', to: '2026-08-30', page: 1, limit: 20, sortOrder: 'desc',
    agentId: OTHER_AGENT, department: 'Operations', status: 'PENDING', category: 'SERVER_SYSTEM', priority: 'URGENT', workBlocking: 'no',
  });
  expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      AND: [
        {}, { status: 'PENDING' }, { category: 'SERVER_SYSTEM' }, { priority: 'URGENT' }, { isWorkBlocking: false },
        { assignedToId: OTHER_AGENT }, { createdBy: { department: 'Operations' } },
        { createdAt: { gte: new Date('2026-08-01T00:00:00.000Z'), lt: new Date('2026-08-31T00:00:00.000Z') } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }));
});

test('Agent summary uses authenticated history attribution, current active statuses, and zero distributions', async () => {
  prisma.ticketHistory.count.mockResolvedValue(4);
  prisma.ticketHistory.findMany.mockResolvedValue([
    { createdAt: new Date('2026-08-02T00:00:00Z'), metadata: { from: 'IN_PROGRESS', to: 'RESOLVED' } },
    { createdAt: new Date('2026-08-03T00:00:00Z'), metadata: { from: 'CLOSED', to: 'OPEN' } },
  ]);
  const summary = await reportService.getSummary(AGENT, { from: '2026-08-01', to: '2026-08-30', interval: 'week' });

  expect(summary.metrics).toEqual({ assignedDuring: 4, resolvedByMe: 1, activeAssigned: 0, workBlockingActive: 0, reopened: 1, averageResolutionHours: null });
  expect(summary.metricNotes.averageResolutionHours).toContain('resolvedAt');
  expect(summary.distributions.byStatus).toEqual({ OPEN: 0, IN_PROGRESS: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 });
  expect(prisma.ticketHistory.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([
    { action: 'ASSIGNED' }, { metadata: { path: ['to'], equals: AGENT.id } },
  ]) }) }));
  expect(prisma.ticketHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([
    { action: 'STATUS_CHANGED' }, { userId: AGENT.id }, { metadata: { path: ['to'], equals: 'RESOLVED' } },
  ]) }) }));
  expect(prisma.ticketHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([
    expect.objectContaining({ AND: expect.arrayContaining([{ metadata: { path: ['to'], equals: 'OPEN' } }, { metadata: { path: ['from'], equals: 'RESOLVED' } }]) }),
    expect.objectContaining({ AND: expect.arrayContaining([{ metadata: { path: ['to'], equals: 'OPEN' } }, { metadata: { path: ['from'], equals: 'CLOSED' } }]) }),
  ]) }) }));
  expect(prisma.ticket.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([
    { assignedToId: AGENT.id }, { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] } },
  ]) }) }));
});

test('Admin summary keeps inactive Agent resolution identities, uses CLOSED plus closedAt, and snapshots active workload', async () => {
  prisma.user.findMany
    .mockResolvedValueOnce([{ id: OTHER_AGENT, name: 'Active Agent', role: 'AGENT', isActive: true }])
    .mockResolvedValueOnce([{ department: 'Operations' }]);
  prisma.ticketHistory.findMany.mockResolvedValue([
    { createdAt: new Date('2026-08-04T00:00:00Z'), metadata: { to: 'RESOLVED' }, user: { id: 'inactive-agent', name: 'Former Agent', role: 'AGENT', isActive: false } },
    { createdAt: new Date('2026-08-05T00:00:00Z'), metadata: { from: 'RESOLVED', to: 'OPEN' }, user: { id: ADMIN.id, name: 'Admin', role: 'ADMIN', isActive: true } },
  ]);
  prisma.ticket.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
    { assignedToId: OTHER_AGENT, status: 'OPEN', _count: { _all: 2 } },
  ]);

  const summary = await reportService.getSummary(ADMIN, { from: '2026-08-01', to: '2026-08-30' });
  expect(summary.metrics.reopened).toBe(1);
  expect(summary.metrics.averageResolutionHours).toBeNull();
  expect(summary.agentActivity.currentWorkload).toEqual([{
    id: OTHER_AGENT, name: 'Active Agent', role: 'AGENT', isActive: true, total: 2,
    byStatus: { OPEN: 2, IN_PROGRESS: 0, PENDING: 0 },
  }]);
  expect(summary.agentActivity.resolutionActivity).toEqual([{
    id: 'inactive-agent', name: 'Former Agent', role: 'AGENT', isActive: false, count: 1,
  }]);
  const closedCall = prisma.ticket.count.mock.calls[1][0];
  expect(closedCall.where.AND).toEqual(expect.arrayContaining([
    { status: 'CLOSED' }, { closedAt: { gte: new Date('2026-08-01T00:00:00.000Z'), lt: new Date('2026-08-31T00:00:00.000Z') } },
  ]));
  const activeCall = prisma.ticket.count.mock.calls[2][0];
  expect(activeCall.where.AND).toEqual(expect.arrayContaining([{ status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] } }]));
});

test('ticket response maps only its approved safe contract fields and omits Admin-only department for Agents', async () => {
  prisma.ticket.findMany.mockResolvedValue([{
    id: 'ticket-1', title: 'Safe', status: 'OPEN', category: 'VPN', priority: 'HIGH', isWorkBlocking: true,
    createdAt: new Date('2026-08-02T03:00:00Z'), closedAt: null, assignedTo: { id: AGENT.id, name: 'Agent' },
    description: 'should not map', createdBy: { department: 'Finance' },
  }]);
  const result = await reportService.listTickets(AGENT, { from: '2026-08-01', to: '2026-08-30', page: 1, limit: 20, sortOrder: 'desc' });
  expect(result.rows[0]).toEqual({
    id: 'ticket-1', title: 'Safe', status: 'OPEN', category: 'VPN', priority: 'HIGH', isWorkBlocking: true,
    createdAt: '2026-08-02T03:00:00.000Z', closedAt: null, assignedAgent: { id: AGENT.id, name: 'Agent' },
  });
  expect(result.rows[0]).not.toHaveProperty('requesterDepartment');
  expect(prisma.ticket.findMany.mock.calls[0][0].select).not.toHaveProperty('description');
});

test('CSV quoting neutralizes formulas after whitespace, preserves Unicode and permitted newlines, and removes unsafe controls', () => {
  const csv = reportService.toCsv([{
    id: 'T-1', title: ' \t=SUM(1,1), "caf\u00e9"\r\nnext\u0000', status: 'OPEN', category: 'VPN', priority: 'HIGH', isWorkBlocking: true,
    createdAt: new Date('2026-08-01T00:00:00Z'), closedAt: null, assignedTo: { name: '\n@evil' }, createdBy: { department: '+Finance' },
  }], 'ADMIN');
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain(`"' \t=SUM(1,1), ""caf\u00e9""\r\nnext"`);
  expect(csv).toContain(`"'+Finance"`);
  expect(csv).toContain(`"'\n@evil"`);
  expect(csv).not.toContain('\u0000');
  expect(csv.split('\r\n')[0]).toContain('Requester Department');
  expect(reportService.sanitizeCsvText(' normal\ttext\u0007')).toBe(' normal\ttext');
});

test('export counts before reading, rejects over 5,000 rows, and keeps search out of audit metadata', async () => {
  prisma.ticket.count.mockResolvedValueOnce(5001);
  await expect(reportService.exportTickets(ADMIN, { from: '2026-08-01', to: '2026-08-30', search: 'sensitive words' })).rejects.toMatchObject({ statusCode: 413 });
  expect(prisma.ticket.findMany).not.toHaveBeenCalled();

  prisma.ticket.count.mockResolvedValueOnce(1);
  prisma.ticket.findMany.mockResolvedValueOnce([]);
  const result = await reportService.exportTickets(AGENT, { from: '2026-08-01', to: '2026-08-30', search: 'do not audit', sortOrder: 'asc' });
  expect(result.filename).toBe('my-reports-2026-08-01-to-2026-08-30.csv');
  expect(result.auditMetadata).toEqual({
    role: 'AGENT', filters: { from: '2026-08-01', to: '2026-08-30', interval: 'day', workBlocking: 'all' },
    range: { from: '2026-08-01', to: '2026-08-30' }, rowCount: 0,
  });
  expect(prisma.ticket.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 5000, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
});
