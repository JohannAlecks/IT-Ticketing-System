const mockDb = {
  $queryRaw: jest.fn(), $transaction: jest.fn(),
  user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  department: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditEvent: { create: jest.fn() },
};
jest.mock('../../../config/prisma', () => mockDb);
const service = require('../department.service'); const schema = require('../department.schema');
const { departmentName, exposeDepartment } = require('../department.projection');
const actor = { id: 'admin', role: 'ADMIN', isActive: true, emailVerified: true };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeEach(() => {
  jest.resetAllMocks(); mockDb.$transaction.mockImplementation((fn) => fn(mockDb));
  mockDb.$queryRaw.mockResolvedValue([{ value: 'support' }]); mockDb.user.findUnique.mockResolvedValue(actor);
  mockDb.department.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, name: 'Support', isActive: true, version: 1 }));
  mockDb.department.update.mockResolvedValue({ id, version: 2 }); mockDb.department.create.mockResolvedValue({ id, name: 'Support' });
  mockDb.user.updateMany.mockResolvedValue({ count: 3 }); mockDb.user.count.mockResolvedValue(3);
});
test.each([{ name: ' ' }, { name: 'x' }, { name: 'x'.repeat(101) }, { name: 'Bad\nName' }, { name: 'Valid', description: 'x'.repeat(501) }, { name: 'Valid', isActive: false }])('rejects invalid/mass-assigned create fields %#', (data) => expect(schema.create.safeParse(data).success).toBe(false));
test('strict bounded ID and list validation', () => {
  for (const data of [{ limit: 51 }, { page: -1 }, { status: 'ANY' }, { password: 'x' }]) expect(schema.list.safeParse(data).success).toBe(false);
  expect(schema.assign.safeParse({ departmentId: 'free text', previousDepartmentId: null }).success).toBe(false);
  expect(schema.create.parse({ name: ' Support ', description: ' ' })).toEqual({ name: 'Support', description: null });
});
test.each(['USER', 'AGENT'])('rechecks %s management authorization inside transaction', async (role) => {
  mockDb.user.findUnique.mockResolvedValue({ ...actor, role }); await expect(service.create(actor, { name: 'Support' })).rejects.toMatchObject({ statusCode: 403 }); expect(mockDb.department.create).not.toHaveBeenCalled();
});
test('create normalizes using database-owned function and audits without personal data', async () => {
  await service.create(actor, { name: 'Support' }); expect(mockDb.department.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Support', description: null, normalizedName: 'support' } }));
  expect(mockDb.auditEvent.create.mock.calls[0][0].data.metadata).toEqual({});
});
test('duplicate normalization and transaction failures are sanitized', async () => {
  mockDb.department.create.mockRejectedValue({ code: 'P2002', message: 'private' }); await expect(service.create(actor, { name: 'Support' })).rejects.toMatchObject({ statusCode: 409 });
  mockDb.department.create.mockRejectedValue(new Error('private')); await expect(service.create(actor, { name: 'Support' })).rejects.toMatchObject({ statusCode: 503, message: 'Department operation unavailable' });
});
test('edit requires the reviewed version and never updates users or snapshots', async () => {
  await expect(service.update(actor, id, { version: 2, name: 'Renamed' })).rejects.toMatchObject({ statusCode: 409 });
  await service.update(actor, id, { version: 1, name: 'Renamed' }); expect(mockDb.user.updateMany).not.toHaveBeenCalled();
});
test('deactivation keeps members intact and records count; activation preserves history', async () => {
  await service.status(actor, id, { version: 1, isActive: false }); expect(mockDb.user.updateMany).not.toHaveBeenCalled();
  expect(mockDb.auditEvent.create.mock.calls[0][0].data).toMatchObject({ eventType: 'department.deactivated', metadata: { memberCount: 3 } });
  mockDb.department.findUnique.mockResolvedValue({ id, version: 2, isActive: false }); await service.status(actor, id, { version: 2, isActive: true });
});
test('merge validates both versions, moves only association and deactivates source', async () => {
  await expect(service.merge(actor, id, { version: 2, targetId, targetVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  await expect(service.merge(actor, id, { version: 1, targetId, targetVersion: 2 })).rejects.toMatchObject({ statusCode: 409 });
  await expect(service.merge(actor, id, { version: 1, targetId: id, targetVersion: 1 })).rejects.toMatchObject({ statusCode: 422 });
  expect(await service.merge(actor, id, { version: 1, targetId, targetVersion: 1 })).toEqual({ movedMembers: 3, targetId });
  expect(mockDb.user.updateMany).toHaveBeenCalledWith({ where: { departmentId: id }, data: { departmentId: targetId } });
});
test('inactive target blocks merge and newly selected inactive membership', async () => {
  mockDb.department.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, version: 1, isActive: where.id !== targetId }));
  await expect(service.merge(actor, id, { version: 1, targetId, targetVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  mockDb.user.findUnique.mockResolvedValue({ id: actor.id, departmentId: id });
  await expect(service.setMembership(mockDb, actor.id, targetId, id)).rejects.toMatchObject({ statusCode: 409 });
  expect(mockDb.user.update).not.toHaveBeenCalled();
});
test('existing inactive membership can be retained; stale membership token rejects atomically', async () => {
  mockDb.department.findUnique.mockResolvedValue({ id, isActive: false }); mockDb.user.findUnique.mockResolvedValue({ id: actor.id, departmentId: id });
  await service.setMembership(mockDb, actor.id, id, id); expect(mockDb.department.updateMany).not.toHaveBeenCalled();
  await expect(service.setMembership(mockDb, actor.id, null, targetId)).rejects.toMatchObject({ statusCode: 409 });
});
test('membership changes increment both versions, null clears legacy only on explicit selection', async () => {
  mockDb.user.findUnique.mockResolvedValue({ id: actor.id, departmentId: id, department: 'Legacy' });
  await service.setMembership(mockDb, actor.id, targetId, id);
  expect(mockDb.user.update.mock.calls[0][0].data).toEqual({ departmentId: targetId });
  await service.setMembership(mockDb, actor.id, null, id);
  expect(mockDb.user.update.mock.calls[1][0].data).toEqual({ departmentId: null, department: null });
});
test('active options have no membership/admin fields; Admin counts remain bounded', async () => {
  mockDb.department.findMany.mockResolvedValue([{ id, name: 'Support', _count: { users: 3 } }]); mockDb.department.count.mockResolvedValue(1); mockDb.user.groupBy.mockResolvedValue([{ departmentId: id, _count: { _all: 2 } }]);
  expect((await service.list({})).departments[0]).toMatchObject({ memberCount: 3, activeAgentCount: 2 });
  await service.list({}, true); expect(mockDb.department.findMany.mock.calls[1][0]).toMatchObject({ where: { isActive: true }, select: { id: true, name: true }, take: 20 });
});
test('canonical projection overrides legacy but does not mutate original snapshot input', () => {
  const user = { department: 'OLD', departmentRecord: { name: 'New', isActive: false } };
  expect(departmentName(user)).toBe('New'); expect(exposeDepartment(user).department).toBe('New'); expect(user.department).toBe('OLD'); expect(departmentName({ department: 'Legacy' })).toBe('Legacy');
  expect(departmentName({ department: '   ' })).toBeNull();
});
test('routes authenticate first and place management behind Admin middleware', () => {
  const router = require('../department.routes'); expect(router.stack[0].handle).toBe(require('../../../middleware/authenticate'));
  const options = router.stack.findIndex((l) => l.route?.path === '/options');
  const adminGuard = router.stack[options + 1].handle;
  for (const role of ['USER', 'AGENT']) expect(() => adminGuard({ user: { role } }, {}, jest.fn())).toThrow(expect.objectContaining({ statusCode: 403 }));
});
