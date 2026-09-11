jest.mock('../../../config/prisma', () => ({
  user: { findUnique: jest.fn() },
  savedTicketView: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  userShortcut: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  $queryRaw: jest.fn(), $executeRaw: jest.fn(), $transaction: jest.fn(),
}));
jest.mock('../../tickets/ticket.service', () => ({ listTickets: jest.fn() }));
const db = require('../../../config/prisma');
const service = require('../personal.service');
const schema = require('../personal.schema');
const { routeFor, assertViewAllowed } = require('../personal.policy');
const tickets = require('../../tickets/ticket.service');
const id = '11111111-1111-4111-8111-111111111111';
const user = { id, role: 'USER', isActive: true, emailVerified: true };
const view = { id, userId: id, name: 'Open work', scope: 'MY_TICKETS', filters: { status: 'OPEN' }, version: 1 };
beforeEach(() => {
  jest.resetAllMocks(); db.$transaction.mockImplementation((cb) => cb(db));
  db.user.findUnique.mockResolvedValue(user); db.savedTicketView.count.mockResolvedValue(0);
  db.savedTicketView.findMany.mockResolvedValue([view]); db.savedTicketView.findFirst.mockResolvedValue(view);
  db.savedTicketView.create.mockImplementation(async ({ data }) => ({ ...data, id, version: 1 }));
  db.savedTicketView.update.mockImplementation(async ({ data }) => ({ ...view, ...data, version: 2 }));
  db.userShortcut.findMany.mockResolvedValue([]);
  db.userShortcut.create.mockImplementation(async ({ data }) => ({ ...data, id, version: 1 }));
  db.userShortcut.update.mockImplementation(async ({ data }) => ({ ...data, id, version: 2 }));
  tickets.listTickets.mockResolvedValue({ tickets: [], pagination: { page: 1 } });
});
test.each([['USER', 'MY_TICKETS'], ['AGENT', 'ASSIGNED_TO_ME'], ['ADMIN', 'ALL_AUTHORIZED']])('%s creates and lists a permitted view', async (role, scope) => {
  db.user.findUnique.mockResolvedValue({ ...user, role });
  const result = await service.createView(user, { name: '  Open work  ', scope, filters: { status: 'OPEN' } });
  expect(result).toMatchObject({ name: 'Open work', scope, available: true });
  expect(db.savedTicketView.create.mock.calls[0][0].data).toMatchObject({ userId: user.id, normalizedName: 'open work' });
  expect((await service.listViews(user)).limit).toBe(20);
  expect(db.$queryRaw).toHaveBeenCalled();
});
test.each(['userId', 'role', 'page', 'search', 'OR', 'where', 'include', 'description', 'email', 'archive', 'token'])('rejects persisted filter %s', (key) => {
  expect(schema.filtersSchema.safeParse({ [key]: 'unsafe' }).success).toBe(false);
});
test.each([{ sortField: 'password' }, { sortDirection: 'random' }, { status: 'INVALID' }, { category: 'INVALID' }, { slaState: 'INVALID' }, { isWorkBlocking: 'false' }, { assignedToId: 'not-uuid' }])('rejects invalid filter enum/value %j', (filters) => expect(schema.filtersSchema.safeParse(filters).success).toBe(false));
test('unknown identity, empty patch, and invalid name bodies fail before database access', async () => {
  for (const body of [{ name: 'x', scope: 'MY_TICKETS', filters: {}, userId: id }, { name: 'x', scope: 'MY_TICKETS', filters: {}, role: 'ADMIN' }, { name: ' ', scope: 'MY_TICKETS', filters: {} }]) await expect(service.createView(user, body)).rejects.toMatchObject({ statusCode: 422 });
  await expect(service.updateView(user, id, { version: 1 })).rejects.toMatchObject({ statusCode: 422 });
  expect(db.$transaction).not.toHaveBeenCalled();
});
test.each(['USER', 'ADMIN'])('%s cannot mutate or execute another owner record', async (role) => {
  db.user.findUnique.mockResolvedValue({ ...user, role }); db.savedTicketView.findFirst.mockResolvedValue(null);
  await expect(service.updateView(user, id, { version: 1, name: 'New' })).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.deleteView(user, id, { version: 1 })).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.executeView(user, id, {})).rejects.toMatchObject({ statusCode: 404 });
  expect(db.savedTicketView.findFirst).toHaveBeenCalledWith({ where: { id, userId: user.id } });
});
test('execution reuses normal ticket service with authoritative assignment/archive and bounded pagination', async () => {
  db.user.findUnique.mockResolvedValue({ ...user, role: 'AGENT' });
  db.savedTicketView.findFirst.mockResolvedValue({ ...view, scope: 'ASSIGNED_TO_ME', filters: { slaState: 'BREACHED' } });
  await service.executeView(user, id, { page: 2, limit: 10 });
  expect(tickets.listTickets).toHaveBeenCalledWith(expect.objectContaining({ role: 'AGENT' }), { assignedToId: id, archive: 'active', slaState: 'BREACHED', page: 2, limit: 10 }, db);
  db.savedTicketView.findFirst.mockResolvedValue({ ...view, scope: 'ARCHIVED' });
  await service.executeView(user, id, {});
  expect(tickets.listTickets.mock.calls[1][1].archive).toBe('archived');
});
test('role downgrade hides fields and blocks execution; owner can still delete unavailable preferences', async () => {
  db.savedTicketView.findFirst.mockResolvedValue({ ...view, scope: 'ALL_AUTHORIZED' });
  db.savedTicketView.findMany.mockResolvedValue([{ ...view, scope: 'ALL_AUTHORIZED' }]);
  expect((await service.listViews(user)).views[0]).toMatchObject({ available: false });
  expect((await service.listViews(user)).views[0].filters).toBeUndefined();
  await expect(service.executeView(user, id, {})).rejects.toMatchObject({ statusCode: 404 });
  await service.deleteView(user, id, { version: 1 }); expect(db.savedTicketView.delete).toHaveBeenCalled();
});
test('corrupt stored filters fail closed', async () => {
  db.savedTicketView.findFirst.mockResolvedValue({ ...view, filters: { OR: [{}] } });
  await expect(service.executeView(user, id, {})).rejects.toMatchObject({ statusCode: 404 });
  expect(tickets.listTickets).not.toHaveBeenCalled();
});
test('limits and unique-name conflicts are safe 409s', async () => {
  db.savedTicketView.count.mockResolvedValue(20);
  await expect(service.createView(user, { name: 'X', scope: 'MY_TICKETS', filters: {} })).rejects.toMatchObject({ statusCode: 409 });
  db.savedTicketView.count.mockResolvedValue(0); db.savedTicketView.create.mockRejectedValue({ code: 'P2002' });
  await expect(service.createView(user, { name: 'X', scope: 'MY_TICKETS', filters: {} })).rejects.toMatchObject({ statusCode: 409 });
  expect(service.normalizeName('ＯＰＥＮ')).toBe('open');
});
test('stale versions reject update/delete', async () => {
  await expect(service.updateView(user, id, { name: 'New', version: 2 })).rejects.toMatchObject({ statusCode: 409 });
  await expect(service.deleteView(user, id, { version: 2 })).rejects.toMatchObject({ statusCode: 409 });
});
test.each(['javascript:alert(1)', '//evil.test', 'https://evil.test', '../users', 'USERS?x=1', '__proto__'])('rejects arbitrary shortcut target %s', async (routeKey) => {
  await expect(service.createShortcut(user, { targetType: 'ROUTE', routeKey, label: 'x' })).rejects.toMatchObject({ statusCode: 422 });
});
test.each(['USERS', 'AUDIT_LOGS', 'SLA_SETTINGS', 'REPORTS', 'ASSIGNED_TICKETS'])('USER cannot target %s', async (routeKey) => {
  await expect(service.createShortcut(user, { targetType: 'ROUTE', routeKey, label: 'x' })).rejects.toMatchObject({ statusCode: 404 });
});
test('Agent reports are personal, Admin route shortcuts remain forbidden', () => {
  expect(routeFor({ role: 'AGENT' }, 'REPORTS').path).toBe('/reports');
  for (const key of ['USERS', 'AUDIT_LOGS', 'SLA_SETTINGS']) expect(routeFor({ role: 'AGENT' }, key)).toBeNull();
});
test('scope/filter authorization rejects privilege widening', () => {
  expect(() => assertViewAllowed(user, 'MY_TICKETS', { slaState: 'BREACHED' })).toThrow();
  expect(() => assertViewAllowed({ ...user, role: 'AGENT' }, 'ALL_AUTHORIZED', { department: 'IT' })).toThrow();
  expect(() => assertViewAllowed({ ...user, role: 'AGENT' }, 'ALL_AUTHORIZED', { assignedToId: 'peer' })).toThrow();
  expect(() => assertViewAllowed(user, 'ARCHIVED', { slaState: 'BREACHED' })).toThrow();
});
test('shortcut cap and duplicate target rejected', async () => {
  db.userShortcut.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, position) => ({ id: String(position), position })));
  await expect(service.createShortcut(user, { targetType: 'ROUTE', routeKey: 'SUMMARY', label: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  db.userShortcut.findMany.mockResolvedValue([{ targetKey: 'route:SUMMARY' }]);
  await expect(service.createShortcut(user, { targetType: 'ROUTE', routeKey: 'SUMMARY', label: 'x' })).rejects.toMatchObject({ statusCode: 409 });
});
test('reorder rejects duplicate, missing, foreign and stale IDs', async () => {
  db.userShortcut.findMany.mockResolvedValue([{ id, version: 1 }]);
  await expect(service.reorderShortcuts(user, { items: [{ id, version: 1 }, { id, version: 1 }] })).rejects.toMatchObject({ statusCode: 422 });
  for (const items of [[], [{ id, version: 2 }], [{ id: '22222222-2222-4222-8222-222222222222', version: 1 }]]) await expect(service.reorderShortcuts(user, { items })).rejects.toMatchObject({ statusCode: 409 });
  await service.reorderShortcuts(user, { items: [{ id, version: 1 }] });
  expect(db.userShortcut.update.mock.calls.map(([arg]) => arg.data.position)).toEqual([8, 0]);
});
test('inactive account is refused without preference deletion; reactivation uses current role', async () => {
  db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
  await expect(service.listViews(user)).rejects.toMatchObject({ statusCode: 401 });
  expect(db.savedTicketView.delete).not.toHaveBeenCalled();
  db.user.findUnique.mockResolvedValue(user);
  const result = await service.listShortcuts({ ...user, role: 'ADMIN' });
  expect(result.routes.some((r) => r.key === 'USERS')).toBe(false);
});
test('unavailable shortcuts expose no path and remain owner-removable', async () => {
  db.userShortcut.findMany.mockResolvedValue([{ id, version: 1, label: 'Old admin page', targetType: 'ROUTE', routeKey: 'USERS', position: 0 }]);
  const row = (await service.listShortcuts(user)).shortcuts[0];
  expect(row.available).toBe(false); expect(row.path).toBeUndefined();
  await service.updateShortcut(user, id, { version: 1 }, true); expect(db.userShortcut.delete).toHaveBeenCalledWith({ where: { id } });
});
test('routes authenticate and validate all preference endpoints; reorder is before UUID route', () => {
  const { views, shortcuts } = require('../personal.routes');
  const authenticate = require('../../../middleware/authenticate');
  expect(views.stack[0].handle).toBe(authenticate); expect(shortcuts.stack[0].handle).toBe(authenticate);
  expect(shortcuts.stack.filter((r) => r.route).map((r) => r.route.path)).toEqual(['/', '/', '/reorder', '/:id', '/:id']);
});
test('deferred validation rejects the service promise with a sanitized 409', async () => {
  db.$executeRaw.mockRejectedValue({ code: 'P2010', meta: { code: '23514' }, message: 'raw database detail that must not escape' });
  await expect(service.reorderShortcuts(user, { items: [] })).rejects.toMatchObject({
    statusCode: 409, message: 'Shortcut order could not be saved. Refresh and try again.', details: null,
  });
  expect(db.$executeRaw.mock.calls[0][0].join('')).toBe('SET CONSTRAINTS public.user_shortcuts_committed_position IMMEDIATE');
});
