jest.mock('../../../config/prisma', () => ({
  ticket: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  ticketHistory: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
}));

const prisma = require('../../../config/prisma');
const dashboardService = require('../dashboard.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.ticket.count.mockResolvedValue(0);
  prisma.ticket.groupBy.mockResolvedValue([]);
  prisma.ticketHistory.findMany.mockResolvedValue([]);
});

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
