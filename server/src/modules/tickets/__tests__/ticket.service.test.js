/**
 * Unit tests for the authorization logic in ticket.service.js.
 *
 * Prisma is mocked — these tests exercise the actual service functions
 * (real code, not reimplemented logic) but never touch a real database.
 * That means they verify the authorization RULES are correct; they do
 * NOT verify the Prisma queries themselves are correct against real
 * Postgres (see the final report for what remains unverified).
 */

jest.mock('../../../config/prisma', () => ({
  ticket: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  notification: { createMany: jest.fn() },
  notificationPreference: { findMany: jest.fn() },
  ticketHistory: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
}));

const mockPrisma = require('../../../config/prisma');
const fs = require('fs');
const ticketService = require('../ticket.service');
const { listQuerySchema } = require('../ticket.schema');

const USER = { id: 'user-1', name: 'Uma User', role: 'USER' };
const AGENT_A = { id: 'agent-a', name: 'Alex Agent', role: 'AGENT' };
const AGENT_B = { id: 'agent-b', name: 'Beth Agent', role: 'AGENT' };
const ADMIN = { id: 'admin-1', name: 'Ada Admin', role: 'ADMIN' };

function baseTicket(overrides = {}) {
  return {
    id: 'ticket-1',
    status: 'OPEN',
    priority: 'MEDIUM',
    createdById: USER.id,
    assignedToId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
});

describe('getTicketById — visibility', () => {
  test('USER can fetch their own ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    await expect(ticketService.getTicketById('ticket-1', USER)).resolves.toBeTruthy();
  });

  test('USER cannot fetch a ticket they did not create', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ createdById: 'someone-else' }));
    await expect(ticketService.getTicketById('ticket-1', USER)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('AGENT can fetch an unassigned ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: null }));
    await expect(ticketService.getTicketById('ticket-1', AGENT_A)).resolves.toBeTruthy();
  });

  test('AGENT can fetch a ticket assigned to them', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    await expect(ticketService.getTicketById('ticket-1', AGENT_A)).resolves.toBeTruthy();
  });

  test('AGENT CANNOT fetch a ticket assigned to a different agent', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    await expect(ticketService.getTicketById('ticket-1', AGENT_A)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('ADMIN can fetch any ticket regardless of assignment', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    await expect(ticketService.getTicketById('ticket-1', ADMIN)).resolves.toBeTruthy();
  });

  test('non-existent ticket returns 404, not 403', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null);
    await expect(ticketService.getTicketById('nope', USER)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('USER comment counts exclude internal notes while staff counts include all comments', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    await ticketService.getTicketById('ticket-1', USER);
    expect(mockPrisma.ticket.findUnique.mock.calls[0][0].include._count).toEqual({
      select: { comments: { where: { isInternal: false } } },
    });

    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    await ticketService.getTicketById('ticket-1', AGENT_A);
    expect(mockPrisma.ticket.findUnique.mock.calls[1][0].include._count).toEqual({
      select: { comments: true },
    });
  });

  test('USER ticket payloads omit assignee email while staff payloads retain it', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    await ticketService.getTicketById('ticket-1', USER);
    expect(mockPrisma.ticket.findUnique.mock.calls[0][0].include.assignedTo.select).toEqual({ id: true, name: true });

    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    await ticketService.getTicketById('ticket-1', AGENT_A);
    expect(mockPrisma.ticket.findUnique.mock.calls[1][0].include.assignedTo.select).toEqual({ id: true, name: true, email: true });
  });
});

describe('updateTicket — status transitions', () => {
  test('a valid transition (OPEN -> IN_PROGRESS) by an agent succeeds', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'OPEN', assignedToId: AGENT_A.id }));
    mockPrisma.ticket.update.mockResolvedValue({ ...baseTicket({ status: 'IN_PROGRESS' }), assignedTo: null });
    await expect(
      ticketService.updateTicket('ticket-1', { status: 'IN_PROGRESS' }, AGENT_A)
    ).resolves.toBeTruthy();
  });

  test('an invalid transition (OPEN -> RESOLVED, skipping IN_PROGRESS) is rejected', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'OPEN', assignedToId: AGENT_A.id }));
    await expect(
      ticketService.updateTicket('ticket-1', { status: 'RESOLVED' }, AGENT_A)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('a CLOSED ticket can be reopened but no other transition is allowed', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'CLOSED', assignedToId: AGENT_A.id }));
    await expect(
      ticketService.updateTicket('ticket-1', { status: 'IN_PROGRESS' }, AGENT_A)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('USER cannot change status even on their own ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'OPEN', createdById: USER.id }));
    await expect(
      ticketService.updateTicket('ticket-1', { status: 'IN_PROGRESS' }, USER)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('AGENT cannot change status on a ticket assigned to a different agent', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'OPEN', assignedToId: AGENT_B.id }));
    await expect(
      ticketService.updateTicket('ticket-1', { status: 'IN_PROGRESS' }, AGENT_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('requester work-impact priority policy', () => {
  test('a normal requester ticket is MEDIUM even when URGENT is supplied', async () => {
    mockPrisma.ticket.create.mockResolvedValue(baseTicket());
    await ticketService.createTicket({ title: 'Normal issue', description: 'A sufficiently detailed description.', priority: 'URGENT', isWorkBlocking: false }, USER);
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ priority: 'MEDIUM', isWorkBlocking: false, impactDescription: null }) }));
  });

  test('a work-blocking requester ticket is HIGH with a trimmed explanation', async () => {
    mockPrisma.ticket.create.mockResolvedValue(baseTicket());
    await ticketService.createTicket({ title: 'Cannot work', description: 'A sufficiently detailed description.', isWorkBlocking: true, impactDescription: '  My computer cannot access the required system.  ' }, USER);
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ priority: 'HIGH', isWorkBlocking: true, impactDescription: 'My computer cannot access the required system.' }) }));
  });

  test('work-blocking tickets require an explanation', async () => {
    await expect(ticketService.createTicket({ title: 'Cannot work', description: 'A sufficiently detailed description.', isWorkBlocking: true }, USER)).rejects.toMatchObject({ statusCode: 422 });
  });

  test('the request schema rejects blank and short impact explanations', () => {
    expect(require('../ticket.schema').createTicketSchema.safeParse({ title: 'Cannot work', description: 'A sufficiently detailed description.', isWorkBlocking: true, impactDescription: '   ' }).success).toBe(false);
    expect(require('../ticket.schema').createTicketSchema.safeParse({ title: 'Cannot work', description: 'A sufficiently detailed description.', isWorkBlocking: true, impactDescription: 'short' }).success).toBe(false);
  });
});

describe('closed ticket triage lock', () => {
  test('an agent can change priority on an active assigned ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'IN_PROGRESS', assignedToId: AGENT_A.id }));
    mockPrisma.ticket.update.mockResolvedValue({ ...baseTicket({ priority: 'HIGH' }), assignedTo: AGENT_A });
    await expect(ticketService.updateTicket('ticket-1', { priority: 'HIGH' }, AGENT_A)).resolves.toBeTruthy();
    expect(mockPrisma.ticketHistory.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ action: 'PRIORITY_CHANGED' })]) }));
  });

  test('an agent cannot change priority after closure', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'CLOSED', assignedToId: AGENT_A.id }));
    await expect(ticketService.updateTicket('ticket-1', { priority: 'URGENT' }, AGENT_A)).rejects.toMatchObject({ statusCode: 422 });
  });

  test('a combined reopen-and-priority payload cannot bypass the closed-ticket lock', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'CLOSED', assignedToId: AGENT_A.id }));
    await expect(ticketService.updateTicket('ticket-1', { status: 'OPEN', priority: 'HIGH' }, AGENT_A)).rejects.toMatchObject({ statusCode: 422 });
  });

  test('an agent cannot change assignment after closure', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ status: 'CLOSED', assignedToId: null }));
    await expect(ticketService.assignTicket('ticket-1', AGENT_A.id, AGENT_A)).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('assignTicket — assignment authorization', () => {
  test('AGENT can assign an unassigned ticket to themselves', async () => {
    mockPrisma.ticket.findUnique
      .mockResolvedValueOnce(baseTicket({ assignedToId: null }))
      .mockResolvedValueOnce({ ...baseTicket({ assignedToId: AGENT_A.id }), assignedTo: AGENT_A });
    mockPrisma.user.findUnique.mockResolvedValue(AGENT_A);
    await expect(ticketService.assignTicket('ticket-1', AGENT_A.id, AGENT_A)).resolves.toBeTruthy();
    expect(mockPrisma.ticketHistory.create).toHaveBeenCalledTimes(1);
  });

  test('AGENT CANNOT assign a ticket to a different agent (reassignment is admin-only)', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: null }));
    mockPrisma.user.findUnique.mockResolvedValue(AGENT_B);
    await expect(ticketService.assignTicket('ticket-1', AGENT_B.id, AGENT_A)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });

  test('AGENT CANNOT touch the assignment of a ticket already assigned to someone else', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    await expect(ticketService.assignTicket('ticket-1', null, AGENT_A)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });

  test('ADMIN can reassign a ticket from one agent to another', async () => {
    mockPrisma.ticket.findUnique
      .mockResolvedValueOnce(baseTicket({ assignedToId: AGENT_A.id }))
      .mockResolvedValueOnce({ ...baseTicket({ assignedToId: AGENT_B.id }), assignedTo: AGENT_B });
    mockPrisma.user.findUnique.mockResolvedValue(AGENT_B);
    await expect(ticketService.assignTicket('ticket-1', AGENT_B.id, ADMIN)).resolves.toBeTruthy();
    expect(mockPrisma.ticketHistory.create).toHaveBeenCalledTimes(1);
  });

  test('a no-op assignment (re-picking the same agent) does NOT create a history entry', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(baseTicket({ assignedToId: AGENT_A.id }));
    // second findUnique call inside the no-op branch (re-fetch for return value)
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(baseTicket({ assignedToId: AGENT_A.id }));

    await ticketService.assignTicket('ticket-1', AGENT_A.id, AGENT_A);
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  test('unassigning an already-unassigned ticket is a no-op (no history, no update)', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: null }));
    await ticketService.assignTicket('ticket-1', null, ADMIN);
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  test('cannot assign a ticket to a plain USER account', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: null }));
    mockPrisma.user.findUnique.mockResolvedValue(USER);
    await expect(ticketService.assignTicket('ticket-1', USER.id, ADMIN)).rejects.toMatchObject({ statusCode: 422 });
  });

  test('a stale conditional assignment is rejected and writes no history', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: null }));
    mockPrisma.user.findUnique.mockResolvedValue(AGENT_A);
    mockPrisma.ticket.updateMany.mockResolvedValue({ count: 0 });
    await expect(ticketService.assignTicket('ticket-1', AGENT_A.id, AGENT_A)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });
});

describe('ticket notification events', () => {
  test('reassignment writes assigned and unassigned inbox entries after history, excluding the actor', async () => {
    const before = baseTicket({ assignedToId: AGENT_A.id, updatedAt: new Date('2026-09-01T00:00:00.000Z') });
    const after = { ...before, assignedToId: AGENT_B.id, assignedTo: AGENT_B, updatedAt: new Date('2026-09-01T00:01:00.000Z') };
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    mockPrisma.user.findUnique.mockResolvedValue(AGENT_B);
    mockPrisma.user.findMany.mockResolvedValue([{ id: AGENT_A.id }, { id: AGENT_B.id }]);
    await ticketService.assignTicket('ticket-1', AGENT_B.id, ADMIN);
    expect(mockPrisma.ticketHistory.create.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.notification.createMany.mock.invocationCallOrder[0]);
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
      expect.objectContaining({ type: 'TICKET_ASSIGNED', recipientId: AGENT_B.id }),
      expect.objectContaining({ type: 'TICKET_UNASSIGNED', recipientId: AGENT_A.id }),
    ]), skipDuplicates: true }));
  });

  test('actual status change notifies active requester and assignee with no ticket content', async () => {
    const before = baseTicket({ assignedToId: AGENT_A.id, updatedAt: new Date('2026-09-01T00:00:00.000Z') });
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce({ ...before, status: 'IN_PROGRESS', updatedAt: new Date('2026-09-01T00:01:00.000Z') });
    mockPrisma.user.findMany.mockResolvedValue([{ id: USER.id }, { id: AGENT_A.id }]);
    await ticketService.updateTicket('ticket-1', { status: 'IN_PROGRESS' }, ADMIN);
    const entries = mockPrisma.notification.createMany.mock.calls[0][0].data;
    expect(entries).toEqual(expect.arrayContaining([expect.objectContaining({ recipientId: USER.id, type: 'TICKET_STATUS_CHANGED' }), expect.objectContaining({ recipientId: AGENT_A.id, type: 'TICKET_STATUS_CHANGED' })]));
    expect(entries[0].message).not.toContain('description');
  });

  test('work-blocking creation notifies active admins with generic safe copy', async () => {
    mockPrisma.ticket.create.mockResolvedValue(baseTicket({ id: 'ticket-safe' }));
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: ADMIN.id }]).mockResolvedValueOnce([{ id: ADMIN.id }]);
    await ticketService.createTicket({ title: 'Cannot work', description: 'secret description', isWorkBlocking: true, impactDescription: 'secret impact explanation' }, USER);
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ type: 'TICKET_WORK_BLOCKING', recipientId: ADMIN.id, message: expect.not.stringContaining('secret') })] }));
  });
});

describe('category filters', () => {
  test('accepts every stable category and rejects legacy or invalid values', () => {
    ['INTERNET_NETWORK', 'VPN', 'PC_LAPTOP', 'PRINTER_SCANNER', 'ACCOUNTS_ACCESS', 'EMAIL', 'SOFTWARE_APPLICATION', 'SERVER_SYSTEM', 'REQUESTS', 'SECURITY', 'OTHERS']
      .forEach((category) => expect(listQuerySchema.safeParse({ category }).success).toBe(true));
    expect(listQuerySchema.safeParse({ category: 'IT' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ category: 'NOT_A_CATEGORY' }).success).toBe(false);
  });

  test('combines category with status, search, pagination, and role visibility', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(0);

    await ticketService.listTickets(AGENT_A, {
      category: 'VPN', status: 'OPEN', search: 'connection', page: 2, limit: 10,
    });

    const where = mockPrisma.ticket.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { OR: [{ assignedToId: AGENT_A.id }, { assignedToId: null }] },
      { status: 'OPEN' },
      { category: 'VPN' },
      { OR: [{ title: { contains: 'connection', mode: 'insensitive' } }, { description: { contains: 'connection', mode: 'insensitive' } }] },
    ]));
    expect(mockPrisma.ticket.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
  });
});

describe('deleteTicket attachment cleanup', () => {
  const ATTACHMENT = { id: 'attachment-1', storagePath: 'delete-ticket-test.txt', originalFileName: 'delete-ticket-test.txt' };

  beforeEach(() => {
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...baseTicket(), attachments: [ATTACHMENT] });
    mockPrisma.ticket.delete.mockResolvedValue(baseTicket());
    mockPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
  });

  afterEach(() => jest.restoreAllMocks());

  test('validates its attachment inventory before cascading metadata and cleans files afterward', async () => {
    await expect(ticketService.deleteTicket('ticket-1')).resolves.toBeUndefined();
    expect(mockPrisma.ticket.delete).toHaveBeenCalledWith({ where: { id: 'ticket-1' } });
    expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
  });

  test('aborts without deleting metadata when any attachment path is unsafe', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...baseTicket(), attachments: [{ ...ATTACHMENT, storagePath: '..\\outside.txt' }] });
    await expect(ticketService.deleteTicket('ticket-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticket.delete).not.toHaveBeenCalled();
  });

  test('treats already-missing attachment files as safe after the cascade', async () => {
    fs.promises.unlink.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(ticketService.deleteTicket('ticket-1')).resolves.toBeUndefined();
    expect(mockPrisma.ticket.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  test('reports and audits cleanup failures after the ticket is deleted', async () => {
    fs.promises.unlink.mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    await expect(ticketService.deleteTicket('ticket-1', { actorUserId: ADMIN.id, requestId: 'request-1' })).rejects.toMatchObject({ statusCode: 500 });
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'attachment.cleanup_failed', entityId: ATTACHMENT.id }),
    }));
  });
});
