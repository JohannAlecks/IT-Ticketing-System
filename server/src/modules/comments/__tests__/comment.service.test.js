jest.mock('../../../config/prisma', () => ({
  ticket: { findUnique: jest.fn() },
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

beforeEach(() => jest.clearAllMocks());

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
