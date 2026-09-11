const mockDb = { user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() }, ticket: { count: jest.fn(), findMany: jest.fn() }, auditEvent: { findMany: jest.fn() }, ticketSatisfaction: { aggregate: jest.fn() } };
jest.mock('../../../config/prisma', () => mockDb);
const service = require('../user.service');
const { listUsersQuerySchema } = require('../user.schema');
beforeEach(() => { jest.resetAllMocks(); mockDb.user.findMany.mockResolvedValue([]); mockDb.user.count.mockResolvedValue(0); });
test('strict bounded filters reject unknown identities, invalid enums, oversized search and pagination', () => {
  for (const input of [{ userId: 'other' }, { role: 'OWNER' }, { status: 'active' }, { page: 0 }, { limit: 51 }, { search: 'x'.repeat(101) }, { department: 'x'.repeat(101) }, { sort: 'password' }, { verification: 'true' }]) expect(listUsersQuerySchema.safeParse(input).success).toBe(false);
  expect(listUsersQuerySchema.parse({})).toMatchObject({ status: 'ACTIVE', page: 1, limit: 20 });
});
test('directory combines filters, caps rows, stable sorts and safely projects workload', async () => {
  mockDb.user.count.mockResolvedValue(43); mockDb.user.findMany.mockResolvedValue([{ id: 'id', _count: { ticketsAssigned: 3 } }]);
  const result = await service.listUsers(listUsersQuerySchema.parse({ page: 2, search: ' Doe ', status: 'ALL', role: 'AGENT', verification: 'UNVERIFIED', department: 'IT', sort: 'name' }));
  const args = mockDb.user.findMany.mock.calls[0][0];
  expect(args).toMatchObject({ take: 20, skip: 20, orderBy: [{ name: 'asc' }, { id: 'asc' }], where: { role: 'AGENT', department: 'IT', emailVerified: false, OR: [{ name: { contains: 'Doe', mode: 'insensitive' } }, { email: { contains: 'Doe', mode: 'insensitive' } }] } });
  expect(args.select).not.toHaveProperty('password'); expect(args.select).not.toHaveProperty('verificationToken');
  expect(result).toEqual({ users: [{ id: 'id', activeWorkload: 3 }], pagination: { page: 2, limit: 20, total: 43, totalPages: 3 } });
});
test('summary uses eight database counts, not unrestricted account records', async () => {
  mockDb.user.count.mockImplementation(async ({ where }) => Object.keys(where).length ? 2 : 10);
  expect(await service.userSummary()).toEqual({ total: 10, active: 2, inactive: 2, admins: 2, agents: 2, users: 2, unverified: 2, withoutDepartment: 2 });
  expect(mockDb.user.findMany).not.toHaveBeenCalled();
});
test('details omit raw audit metadata, comment bodies and credentials; recent lists are bounded', async () => {
  mockDb.user.findUnique.mockResolvedValue({ id: 'target', role: 'AGENT' }); mockDb.ticket.count.mockResolvedValue(2); mockDb.ticket.findMany.mockResolvedValue([]); mockDb.auditEvent.findMany.mockResolvedValue([]); mockDb.ticketSatisfaction.aggregate.mockResolvedValue({ _count: { rating: 0 }, _avg: { rating: null } });
  expect(await service.userDetails('target')).toMatchObject({ activeWorkload: 2, sla: { dueSoon: 2, breached: 2 }, csat: { count: 0, average: null } });
  expect(mockDb.ticket.findMany.mock.calls[0][0]).toMatchObject({ take: 5 }); expect(mockDb.ticket.findMany.mock.calls[0][0].select).not.toHaveProperty('description');
  expect(mockDb.auditEvent.findMany.mock.calls[0][0]).toMatchObject({ take: 5, select: { id: true, eventType: true, createdAt: true } });
});
test('every directory and lifecycle route is Admin-only except the existing staff candidate list', () => {
  const router = require('../user.routes');
  expect(router.stack[0].handle).toBe(require('../../../middleware/authenticate'));
  for (const layer of router.stack.filter((layer) => layer.route && layer.route.path !== '/agents')) {
    for (const role of ['USER', 'AGENT']) { const next = jest.fn(); expect(() => layer.route.stack[0].handle({ user: { role } }, {}, next)).toThrow(expect.objectContaining({ statusCode: 403 })); }
    const next = jest.fn(); layer.route.stack[0].handle({ user: { role: 'ADMIN' } }, {}, next); expect(next).toHaveBeenCalledWith();
  }
});
test('profile schema normalizes blank department to null and rejects privileged mass assignment', () => {
  const { updateProfileSchema } = require('../../settings/settings.schema');
  expect(updateProfileSchema.parse({ name: ' Person ', department: ' ' })).toEqual({ name: 'Person', department: null });
  for (const field of ['role', 'isActive', 'emailVerified', 'email', 'password']) expect(updateProfileSchema.safeParse({ name: 'Person', department: null, [field]: true }).success).toBe(false);
  expect(updateProfileSchema.safeParse({ name: 'Person', department: 'x'.repeat(101) }).success).toBe(false);
});
