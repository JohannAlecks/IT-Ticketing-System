jest.mock('../../../config/prisma', () => ({
  ticket: { findUnique: jest.fn(), updateMany: jest.fn() },
  user: { findMany: jest.fn() },
  notification: { createMany: jest.fn() },
  notificationPreference: { findMany: jest.fn() },
  comment: { findMany: jest.fn(), create: jest.fn() },
  ticketHistory: { create: jest.fn() },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
}));

const mockPrisma = require('../../../config/prisma');
const commentService = require('../comment.service');

const USER = { id: 'user-1', name: 'Uma User', role: 'USER' };
const AGENT_A = { id: 'agent-a', name: 'Alex Agent', role: 'AGENT' };
const AGENT_B = { id: 'agent-b', name: 'Beth Agent', role: 'AGENT' };
const ADMIN = { id: 'admin-1', name: 'Ada Admin', role: 'ADMIN' };

function baseTicket(overrides = {}) {
  return { id: 'ticket-1', createdById: USER.id, assignedToId: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
});

describe('listComments — internal note visibility', () => {
  test('USER request excludes internal notes at the query level', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    mockPrisma.comment.findMany.mockResolvedValue([]);
    await commentService.listComments('ticket-1', USER);
    expect(mockPrisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isInternal: false }) })
    );
  });

  test('AGENT/ADMIN requests are not filtered by isInternal', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    mockPrisma.comment.findMany.mockResolvedValue([]);
    await commentService.listComments('ticket-1', AGENT_A);
    const callArg = mockPrisma.comment.findMany.mock.calls[0][0];
    expect(callArg.where.isInternal).toBeUndefined();
  });

  test('USER cannot list comments on a ticket they do not own', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ createdById: 'someone-else' }));
    await expect(commentService.listComments('ticket-1', USER)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('AGENT cannot list comments on a ticket assigned to a different agent', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    await expect(commentService.listComments('ticket-1', AGENT_A)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('addComment — internal note authorization', () => {
  test('archived tickets reject comment creation before any comment/history write', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ archivedAt: new Date() }));
    await expect(commentService.addComment('ticket-1', { content: 'hi', isInternal: false }, USER)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });

  test('USER cannot post an internal note', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    await expect(
      commentService.addComment('ticket-1', { content: 'hi', isInternal: true }, USER)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('USER can post a public comment on their own ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket());
    mockPrisma.comment.create.mockResolvedValue({ id: 'c1', content: 'hi', isInternal: false });
    await expect(
      commentService.addComment('ticket-1', { content: 'hi', isInternal: false }, USER)
    ).resolves.toBeTruthy();
  });

  test('AGENT can post an internal note on a ticket assigned to them', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    mockPrisma.comment.create.mockResolvedValue({ id: 'c1', content: 'internal', isInternal: true });
    await expect(
      commentService.addComment('ticket-1', { content: 'internal', isInternal: true }, AGENT_A)
    ).resolves.toBeTruthy();
  });

  test('AGENT cannot comment on a ticket assigned to a different agent', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    await expect(
      commentService.addComment('ticket-1', { content: 'hi', isInternal: false }, AGENT_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('ADMIN can comment on any ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_B.id }));
    mockPrisma.comment.create.mockResolvedValue({ id: 'c1', content: 'hi', isInternal: false });
    await expect(
      commentService.addComment('ticket-1', { content: 'hi', isInternal: false }, ADMIN)
    ).resolves.toBeTruthy();
  });
});

describe('comment notification events', () => {
  test('public requester comment notifies only the current assignee without storing comment content', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    mockPrisma.comment.create.mockResolvedValue({ id: 'comment-1', content: 'private reply words', isInternal: false });
    mockPrisma.user.findMany.mockResolvedValue([{ id: AGENT_A.id }]);
    await commentService.addComment('ticket-1', { content: 'private reply words', isInternal: false }, USER);
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ recipientId: AGENT_A.id, type: 'TICKET_PUBLIC_REPLY', message: expect.not.stringContaining('private reply words') })] }));
  });

  test('internal notes do not produce requester notifications', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(baseTicket({ assignedToId: AGENT_A.id }));
    mockPrisma.comment.create.mockResolvedValue({ id: 'comment-2', isInternal: true });
    await commentService.addComment('ticket-1', { content: 'secret internal note', isInternal: true }, AGENT_A);
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });
});
