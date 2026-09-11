const mockDb = {
  $queryRaw: jest.fn(), $transaction: jest.fn(),
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  ticket: { findFirst: jest.fn(), findMany: jest.fn() },
  ticketWatcher: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  notification: { createMany: jest.fn() }, notificationPreference: { findMany: jest.fn() },
};
jest.mock('../../../config/prisma', () => mockDb);
const db = mockDb;
const { watching, notifyTicketWatchers } = require('../watcher.service');
const { writeNotifications, eventEntry } = require('../../notifications/notification.service');
const id = '11111111-1111-4111-8111-111111111111';
const owner = { id: 'owner', role: 'USER', isActive: true, emailVerified: true };
const ticket = { id, createdById: owner.id, assignedToId: 'agent', archivedAt: null };
const member = (id, role = 'ADMIN', extra = {}) => ({ id, role, isActive: true, emailVerified: true, ...extra });
beforeEach(() => {
  jest.resetAllMocks(); db.$transaction.mockImplementation((fn) => fn(db));
  db.user.findUnique.mockResolvedValue(owner); db.ticket.findFirst.mockResolvedValue(ticket);
  db.ticket.findMany.mockResolvedValue([ticket]); db.ticketWatcher.findMany.mockResolvedValue([]);
  db.notificationPreference.findMany.mockResolvedValue([]); db.notification.createMany.mockResolvedValue({ count: 1 });
  db.user.findMany.mockImplementation(async ({ where }) => where.id.in.map((id) => member(id, id === owner.id ? 'USER' : 'ADMIN')));
});
test.each(['USER', 'AGENT', 'ADMIN'])('%s uses current account role, scoped lookup, self-only idempotent join and minimal response', async (role) => {
  db.user.findUnique.mockResolvedValue({ ...owner, role });
  await expect(watching({ ...owner, role: 'untrusted' }, id, 'watch')).resolves.toEqual({ isWatching: true });
  expect(db.ticketWatcher.upsert).toHaveBeenCalledWith({ where: { ticketId_userId: { ticketId: id, userId: owner.id } }, create: { ticketId: id, userId: owner.id }, update: {} });
  const scope = role === 'ADMIN' ? {} : role === 'AGENT' ? { OR: [{ assignedToId: owner.id }, { assignedToId: null }] } : { createdById: owner.id };
  expect(db.ticket.findFirst.mock.calls[0][0].where.AND).toContainEqual(scope);
});
test.each(['read', 'watch', 'unwatch'])('inaccessible or missing ticket yields 404 for %s', async (action) => {
  db.ticket.findFirst.mockResolvedValue(null);
  await expect(watching(owner, id, action)).rejects.toMatchObject({ statusCode: 404 });
  expect(db.ticketWatcher.upsert).not.toHaveBeenCalled(); expect(db.ticketWatcher.deleteMany).not.toHaveBeenCalled();
});
test.each([{ userId: 'other' }, { recipientId: 'other' }, { isWatching: true }])('rejects nonempty mutation body %p before database access', async (body) => {
  await expect(watching(owner, id, 'watch', body)).rejects.toMatchObject({ statusCode: 422 });
  expect(db.$transaction).not.toHaveBeenCalled();
});
test('rejects invalid ID and inactive/unverified accounts without changing joins', async () => {
  await expect(watching(owner, 'invalid', 'watch')).rejects.toMatchObject({ statusCode: 422 });
  for (const change of [{ isActive: false }, { emailVerified: false }]) {
    db.user.findUnique.mockResolvedValue({ ...owner, ...change });
    await expect(watching(owner, id, 'unwatch')).rejects.toMatchObject({ statusCode: 401 });
  }
  expect(db.ticketWatcher.deleteMany).not.toHaveBeenCalled();
});
test('archived joins remain readable/removable but cannot be added', async () => {
  db.ticket.findFirst.mockResolvedValue({ ...ticket, archivedAt: new Date() });
  db.ticketWatcher.findUnique.mockResolvedValue({ id: 'private-id' });
  await expect(watching(owner, id)).resolves.toEqual({ isWatching: true });
  await expect(watching(owner, id, 'watch')).rejects.toMatchObject({ statusCode: 409 });
  await expect(watching(owner, id, 'unwatch')).resolves.toEqual({ isWatching: false });
  expect(db.ticketWatcher.deleteMany).toHaveBeenCalledWith({ where: { ticketId: id, userId: owner.id } });
});
test.each([['P2002', 409], ['P2034', 409], ['unknown', 503]])('database failure %s is redacted', async (code, statusCode) => {
  db.ticketWatcher.upsert.mockRejectedValue({ code, message: 'private database detail' });
  await expect(watching(owner, id, 'watch')).rejects.toMatchObject({ statusCode });
  await expect(watching(owner, id, 'watch')).rejects.not.toHaveProperty('message', 'private database detail');
});
const fanout = (extra = {}) => notifyTicketWatchers(db, { ticket, actorId: 'actor', eventId: 'stable-history-id', kind: 'STATUS_PRIORITY', ...extra });
const rows = (users) => users.map((user, n) => ({ id: String(n).padStart(4, '0'), user }));
const data = () => db.notification.createMany.mock.calls.flatMap(([args]) => args.data);
test('fanout excludes actor, inactive, unverified, inaccessible Agent/requester, and opted-out watcher', async () => {
  db.ticketWatcher.findMany.mockResolvedValue(rows([member('actor'), member('inactive', 'ADMIN', { isActive: false }), member('unverified', 'ADMIN', { emailVerified: false }), member('foreign', 'AGENT'), member('foreign-user', 'USER'), member('disabled'), member('allowed')]));
  db.notificationPreference.findMany.mockResolvedValue([{ userId: 'disabled', ticketWatchedUpdates: false }]);
  await fanout();
  expect(data()).toEqual([expect.objectContaining({ recipientId: 'allowed', message: 'An authorized ticket you follow has a new public update.', dedupeKey: 'n:TICKET_WATCHED_UPDATE:STATUS_PRIORITY:stable-history-id:allowed' })]);
  expect(data()[0]).not.toHaveProperty('watcherStaffOnly');
});
test('domain notification suppresses duplicate, but optional domain opt-out permits watched update', async () => {
  db.ticketWatcher.findMany.mockResolvedValue(rows([owner]));
  const domainEntries = [eventEntry({ recipientId: owner.id, type: 'TICKET_STATUS_CHANGED', ticketId: id, eventId: 'event', title: 'Status', message: 'Safe' })];
  await fanout({ domainEntries }); expect(data().map((row) => row.type)).toEqual(['TICKET_STATUS_CHANGED']);
  db.notification.createMany.mockClear();
  db.notificationPreference.findMany.mockResolvedValue([{ userId: owner.id, ticketStatusChanged: false }]);
  await fanout({ domainEntries }); expect(data().map((row) => row.type)).toEqual(['TICKET_WATCHED_UPDATE']);
});
test.each(['INTERNAL_NOTE', 'ARCHIVE', 'RESTORE', 'SLA', 'WATCH'])('%s does not load watchers', async (kind) => {
  await fanout({ kind }); expect(db.ticketWatcher.findMany).not.toHaveBeenCalled();
});
test('archived public event does not load watchers', async () => {
  await fanout({ ticket: { ...ticket, archivedAt: new Date() } }); expect(db.ticketWatcher.findMany).not.toHaveBeenCalled();
});
test('requester reply is staff-only, including latest writer role changes', async () => {
  db.ticketWatcher.findMany.mockResolvedValue(rows([owner, member(owner.id), member('staff')]));
  await fanout({ kind: 'PUBLIC_REQUESTER_REPLY' });
  expect(data().map((row) => row.recipientId)).toEqual(['staff']);
});
test('writer independently rechecks current access and archive state', async () => {
  db.user.findMany.mockResolvedValue([member('foreign', 'AGENT')]);
  const entry = eventEntry({ recipientId: 'foreign', type: 'TICKET_WATCHED_UPDATE', ticketId: id, eventId: 'e' });
  await writeNotifications(db, { entries: [entry, entry] }); expect(data()).toEqual([]);
  db.user.findMany.mockResolvedValue([member('foreign')]); db.ticket.findMany.mockResolvedValue([]);
  await writeNotifications(db, { entries: [entry] }); expect(data()).toEqual([]);
});
test('loads bounded batches, uses stable unique keys and database skipDuplicates', async () => {
  db.ticketWatcher.findMany.mockResolvedValueOnce(rows(Array.from({ length: 200 }, (_, i) => member(`admin-${i}`)))).mockResolvedValueOnce(rows([member('last')]));
  await fanout();
  expect(data()).toHaveLength(201);
  expect(db.ticketWatcher.findMany.mock.calls[1][0]).toMatchObject({ take: 200, where: { ticketId: id, id: { gt: '0199' } } });
  expect(db.notification.createMany.mock.calls.every(([args]) => args.skipDuplicates)).toBe(true);
  expect(new Set(data().map((row) => row.dedupeKey)).size).toBe(201);
});
test('ticket and saved-view schemas strictly bind Boolean watched filter, never arbitrary watcher IDs', () => {
  const { listQuerySchema } = require('../../tickets/ticket.schema');
  const { filtersSchema } = require('../../personal/personal.schema');
  expect(listQuerySchema.parse({ watchedByMe: 'true' }).watchedByMe).toBe(true);
  for (const invalid of [{ watchedByMe: 'yes' }, { watcherId: 'foreign' }]) expect(listQuerySchema.safeParse(invalid).success).toBe(false);
  expect(filtersSchema.parse({ watchedByMe: true, priority: 'HIGH' })).toEqual({ watchedByMe: true, priority: 'HIGH' });
  expect(filtersSchema.safeParse({ watchedByMe: 'true' }).success).toBe(false);
});
