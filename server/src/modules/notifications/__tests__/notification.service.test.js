const mockPrisma = {
  user: { findMany: jest.fn() },
  notification: { createMany: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
};

jest.mock('../../../config/prisma', () => mockPrisma);

const service = require('../notification.service');
const { listQuerySchema, emptyBodySchema } = require('../notification.schema');

const OWNER = { id: '11111111-1111-4111-8111-111111111111' };
const OTHER = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([{ id: OWNER.id }]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
});

test('writer deduplicates recipients, excludes the actor, and rechecks active recipients', async () => {
  await service.writeNotifications(mockPrisma, {
    actorId: OTHER,
    entries: [
      service.eventEntry({ recipientId: OWNER.id, type: 'TICKET_ASSIGNED', ticketId: ID, title: 'Ticket assigned', message: 'Safe copy.', eventId: 'a' }),
      service.eventEntry({ recipientId: OWNER.id, type: 'TICKET_ASSIGNED', ticketId: ID, title: 'Ticket assigned', message: 'Safe copy.', eventId: 'a' }),
      service.eventEntry({ recipientId: OTHER, type: 'TICKET_ASSIGNED', ticketId: ID, title: 'Ticket assigned', message: 'Safe copy.', eventId: 'a' }),
    ],
  });
  expect(mockPrisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: [OWNER.id] }, isActive: true }, select: { id: true } });
  expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ recipientId: OWNER.id, actorId: OTHER })] }));
});

test('inbox query/body contracts reject recipient-controlled fields and cap pagination', () => {
  expect(listQuerySchema.safeParse({ recipientId: OWNER.id }).success).toBe(false);
  expect(listQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(emptyBodySchema.safeParse({ recipientId: OWNER.id }).success).toBe(false);
});

test('writer skips inactive recipients and never forwards arbitrary fields', async () => {
  mockPrisma.user.findMany.mockResolvedValue([]);
  await service.writeNotifications(mockPrisma, { entries: [{ recipientId: OWNER.id, type: 'TICKET_ASSIGNED', title: 'Safe', message: 'Safe', dedupeKey: 'k', metadata: 'not persisted' }] });
  expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
});

test('list is recipient-scoped, newest-first with a deterministic id tiebreak and safe projection', async () => {
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.count.mockResolvedValue(0);
  await service.listNotifications(OWNER, { status: 'UNREAD', type: 'TICKET_ASSIGNED', page: 2, limit: 20 });
  const args = mockPrisma.notification.findMany.mock.calls[0][0];
  expect(args).toMatchObject({ where: { recipientId: OWNER.id, readAt: null, type: 'TICKET_ASSIGNED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 20, take: 20 });
  expect(args.select).toEqual(service.NOTIFICATION_SELECT);
  expect(args.select).not.toHaveProperty('actor');
});

test('unread count and read-all are constrained to the current recipient', async () => {
  mockPrisma.notification.count.mockResolvedValue(3);
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
  await expect(service.unreadCount(OWNER)).resolves.toBe(3);
  await service.readAll(OWNER);
  expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { recipientId: OWNER.id, readAt: null } }));
});

test('another user, including an admin, cannot mark a notification read or unread', async () => {
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.setReadState({ id: OTHER, role: 'ADMIN' }, ID, true)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.setReadState({ id: OTHER, role: 'ADMIN' }, ID, false)).rejects.toMatchObject({ statusCode: 404 });
  expect(mockPrisma.notification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: ID, recipientId: OTHER } }));
});

test('owned read/unread updates return only the safe projection', async () => {
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.notification.findFirst.mockResolvedValue({ id: ID });
  await service.setReadState(OWNER, ID, true);
  expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: ID, recipientId: OWNER.id }, select: service.NOTIFICATION_SELECT });
});
