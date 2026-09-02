jest.mock('../../../config/prisma', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  notification: { createMany: jest.fn() },
  notificationPreference: { findMany: jest.fn() },
  ticket: { findMany: jest.fn(), updateMany: jest.fn() },
  ticketHistory: { createMany: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(async (callback) => callback(mockPrisma)),
}));

const mockPrisma = require('../../../config/prisma');
const userService = require('../user.service');

const ACTOR = { id: 'admin-1', name: 'Ada Admin', role: 'ADMIN' };
const INACTIVE_AGENT = { id: 'agent-1', name: 'Alex Agent', email: 'alex@example.com', role: 'AGENT', isActive: false, department: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-event-1' });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
});

describe('reactivateUser', () => {
  test('reactivates an inactive user and creates an audit event in the transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(INACTIVE_AGENT);
    mockPrisma.user.update.mockResolvedValue({ ...INACTIVE_AGENT, isActive: true });
    await expect(userService.reactivateUser(INACTIVE_AGENT.id, ACTOR, 'request-1')).resolves.toMatchObject({ isActive: true });
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'USER_REACTIVATED', actorUserId: ACTOR.id, entityId: INACTIVE_AGENT.id }) }));
  });

  test('returns 404 for a missing user and conflict for an active user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(userService.reactivateUser('missing', ACTOR)).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...INACTIVE_AGENT, isActive: true });
    await expect(userService.reactivateUser(INACTIVE_AGENT.id, ACTOR)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('reactivation writes one inbox entry after the lifecycle audit; deactivation does not', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(INACTIVE_AGENT);
    mockPrisma.user.update.mockResolvedValue({ ...INACTIVE_AGENT, isActive: true });
    mockPrisma.user.findMany.mockResolvedValue([{ id: INACTIVE_AGENT.id }]);
    mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
    await userService.reactivateUser(INACTIVE_AGENT.id, ACTOR, 'request-3');
    expect(mockPrisma.auditEvent.create.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.notification.createMany.mock.invocationCallOrder[0]);
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ recipientId: INACTIVE_AGENT.id, type: 'ACCOUNT_REACTIVATED' })] }));

    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ ...INACTIVE_AGENT, isActive: true });
    mockPrisma.user.update.mockResolvedValue(INACTIVE_AGENT);
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    await userService.deactivateUser(INACTIVE_AGENT.id, ACTOR, 'request-4');
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('changeUserLifecycle', () => {
  const ACTIVE_ADMIN = { ...INACTIVE_AGENT, id: 'admin-2', role: 'ADMIN', isActive: true };

  test('blocks self-demotion and writes no audit event', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...ACTIVE_ADMIN, id: ACTOR.id });

    await expect(userService.updateUserRole(ACTOR.id, 'AGENT', ACTOR, 'request-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  test('rechecks the active admin count in the transaction before a demotion', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_ADMIN);
    mockPrisma.user.count.mockResolvedValue(1);

    await expect(userService.updateUserRole(ACTIVE_ADMIN.id, 'AGENT', ACTOR, 'request-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.user.count).toHaveBeenCalledWith({ where: { role: 'ADMIN', isActive: true } });
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  test('generic status deactivation performs ticket cleanup, history, and audit in one transaction', async () => {
    const target = { ...INACTIVE_AGENT, isActive: true };
    mockPrisma.user.findUnique.mockResolvedValue(target);
    mockPrisma.ticket.findMany.mockResolvedValue([{ id: 'ticket-1' }]);
    mockPrisma.user.update.mockResolvedValue({ ...target, isActive: false });

    const result = await userService.setUserActive(target.id, false, ACTOR, 'request-1');

    expect(result).toMatchObject({ user: { isActive: false }, unassignedTickets: 1 });
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedToId: null } }));
    expect(mockPrisma.ticketHistory.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'user.deactivated', requestId: 'request-1' }) }));
  });

  test('demoting assignment-capable staff to USER unassigns unresolved tickets', async () => {
    const target = { ...INACTIVE_AGENT, isActive: true };
    mockPrisma.user.findUnique.mockResolvedValue(target);
    mockPrisma.ticket.findMany.mockResolvedValue([{ id: 'ticket-1' }]);
    mockPrisma.user.update.mockResolvedValue({ ...target, role: 'USER' });

    await expect(userService.updateUserRole(target.id, 'USER', ACTOR, 'request-2')).resolves.toMatchObject({ role: 'USER' });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedToId: null } }));
    expect(mockPrisma.ticketHistory.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ action: 'UNASSIGNED', metadata: expect.objectContaining({ roleChangedUserId: target.id, role: 'USER' }) })],
    }));
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'user.role_changed', metadata: expect.objectContaining({ unassignedTickets: 1 }) }),
    }));
  });
});

describe('user status filters and assignment candidates', () => {
  test('uses the requested active, inactive, or all filter', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    await userService.listUsers({ status: 'ACTIVE' });
    expect(mockPrisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true } }));
    await userService.listUsers({ status: 'INACTIVE' });
    expect(mockPrisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: false } }));
    await userService.listUsers({ status: 'ALL' });
    expect(mockPrisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  test('assignment candidates remain active agents or admins only', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    await userService.listAgents();
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: { in: ['AGENT', 'ADMIN'] }, isActive: true },
      select: { id: true, name: true, role: true },
    }));
  });
});
