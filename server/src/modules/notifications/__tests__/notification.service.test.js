const mockPrisma = {
  user: { findMany: jest.fn() },
  notification: { createMany: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  notificationPreference: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
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
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
  mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
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

test('preference API contracts are strict and reject client-controlled identities', () => {
  const { preferencePatchSchema } = require('../notification.schema');
  expect(preferencePatchSchema.safeParse({}).success).toBe(false);
  expect(preferencePatchSchema.safeParse({ ticketAssigned: 'false' }).success).toBe(false);
  expect(preferencePatchSchema.safeParse({ ticketAssigned: false, userId: OTHER }).success).toBe(false);
  expect(preferencePatchSchema.safeParse({ ticketAssigned: false, role: 'ADMIN' }).success).toBe(false);
});

test('writer skips inactive recipients and never forwards arbitrary fields', async () => {
  mockPrisma.user.findMany.mockResolvedValue([]);
  await service.writeNotifications(mockPrisma, { entries: [{ recipientId: OWNER.id, type: 'TICKET_ASSIGNED', title: 'Safe', message: 'Safe', dedupeKey: 'k', metadata: 'not persisted' }] });
  expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
});

test('writer batch-loads preferences once, suppresses only opted-out optional events, and keeps recipients independent', async () => {
  const secondRecipient = '44444444-4444-4444-8444-444444444444';
  mockPrisma.user.findMany.mockResolvedValue([{ id: OWNER.id }, { id: secondRecipient }]);
  mockPrisma.notificationPreference.findMany.mockResolvedValue([{ userId: OWNER.id, ticketAssigned: false }]);
  await service.writeNotifications(mockPrisma, {
    entries: [
      service.eventEntry({ recipientId: OWNER.id, type: 'TICKET_ASSIGNED', title: 'Assigned', message: 'Safe.', eventId: 'one' }),
      service.eventEntry({ recipientId: secondRecipient, type: 'TICKET_ASSIGNED', title: 'Assigned', message: 'Safe.', eventId: 'one' }),
      service.eventEntry({ recipientId: OWNER.id, type: 'TICKET_PUBLIC_REPLY', title: 'Reply', message: 'Safe.', eventId: 'two' }),
    ],
  });
  expect(mockPrisma.notificationPreference.findMany).toHaveBeenCalledTimes(1);
  expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
    expect.objectContaining({ recipientId: secondRecipient, type: 'TICKET_ASSIGNED' }),
    expect.objectContaining({ recipientId: OWNER.id, type: 'TICKET_PUBLIC_REPLY' }),
  ]) }));
  expect(mockPrisma.notification.createMany.mock.calls[0][0].data).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ recipientId: OWNER.id, type: 'TICKET_ASSIGNED' }),
  ]));
});

test('writer never filters the mandatory account reactivation notification', async () => {
  mockPrisma.notificationPreference.findMany.mockResolvedValue([{ userId: OWNER.id, ticketAssigned: false }]);
  await service.writeNotifications(mockPrisma, {
    entries: [service.eventEntry({ recipientId: OWNER.id, type: 'ACCOUNT_REACTIVATED', title: 'Reactivated', message: 'Safe.', eventId: 'three' })],
  });
  expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ type: 'ACCOUNT_REACTIVATED', recipientId: OWNER.id })] }));
});

test('GET preferences returns role-visible defaults without creating a row', async () => {
  await expect(service.getNotificationPreferences({ ...OWNER, role: 'USER' })).resolves.toEqual({
    preferences: { ticketStatusChanged: true, ticketPublicReply: true, accountReactivated: true },
    mandatory: ['accountReactivated'],
  });
  expect(mockPrisma.notificationPreference.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER.id } }));
  expect(mockPrisma.notificationPreference.upsert).not.toHaveBeenCalled();
});

test('role visibility exposes only supported optional fields while admins receive all eight', () => {
  expect(service.visiblePreferenceFields('USER')).toEqual(['ticketStatusChanged', 'ticketPublicReply']);
  expect(service.visiblePreferenceFields('AGENT')).toEqual(['ticketAssigned', 'ticketUnassigned', 'ticketStatusChanged', 'ticketPublicReply', 'knowledgePublished', 'knowledgeReturned']);
  expect(service.visiblePreferenceFields('ADMIN')).toEqual(service.PREFERENCE_FIELDS);
});

test('PATCH preferences accepts only current-role fields and audits exactly changed key names', async () => {
  const user = { ...OWNER, role: 'AGENT' };
  mockPrisma.notificationPreference.upsert.mockResolvedValue({ ticketAssigned: false, ticketUnassigned: true, ticketStatusChanged: true, ticketPublicReply: true, knowledgePublished: true, knowledgeReturned: true });
  await expect(service.updateNotificationPreferences(user, { ticketAssigned: false }, 'request-1')).resolves.toEqual({
    preferences: { ticketAssigned: false, ticketUnassigned: true, ticketStatusChanged: true, ticketPublicReply: true, knowledgePublished: true, knowledgeReturned: true, accountReactivated: true },
    mandatory: ['accountReactivated'],
  });
  expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER.id }, create: { userId: OWNER.id, ticketAssigned: false }, update: { ticketAssigned: false } }));
  expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({ data: {
    eventType: 'notification.preferences_updated', entityType: 'notification_preferences', entityId: OWNER.id,
    actorUserId: OWNER.id, requestId: 'request-1', metadata: { changedKeys: ['ticketAssigned'] },
  } });
  await expect(service.updateNotificationPreferences({ ...OWNER, role: 'USER' }, { ticketAssigned: false }, 'request-2')).rejects.toMatchObject({ statusCode: 422 });
});

test('unchanged preference PATCH does not upsert or add audit history', async () => {
  mockPrisma.notificationPreference.findUnique.mockResolvedValue({ ticketStatusChanged: false });
  await service.updateNotificationPreferences({ ...OWNER, role: 'USER' }, { ticketStatusChanged: false }, 'request-3');
  expect(mockPrisma.notificationPreference.upsert).not.toHaveBeenCalled();
  expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
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
