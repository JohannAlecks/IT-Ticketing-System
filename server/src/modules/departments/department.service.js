const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const schemas = require('./department.schema');
const { departmentSelect, exposeDepartment } = require('./department.projection');
const select = { id: true, name: true, description: true, isActive: true, version: true, createdAt: true, updatedAt: true };
const conflict = () => new AppError('Department or membership changed. Refresh and try again.', 409);
function parse(schema, input) { const result = schema.safeParse(input); if (!result.success) throw new AppError('Invalid department fields', 422); return result.data; }
async function transaction(actor, callback, admin = true) {
  try { return await prisma.$transaction(async (tx) => {
    // Same global order as account lifecycle: prevents actor revocation and
    // membership races without opposite department/user lock ordering.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73521, 1)::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73521, 2)::text`;
    const current = await tx.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true, isActive: true, emailVerified: true } });
    if (!current?.isActive || !current.emailVerified) throw new AppError('Authentication required', 401);
    if (admin && current.role !== 'ADMIN') throw new AppError('Administrator access required', 403);
    return callback(tx, current);
  }, { isolationLevel: 'ReadCommitted' }); }
  catch (error) { if (['P2002', 'P2034', 'P2025'].includes(error.code)) throw conflict(); if (error.statusCode) throw error; throw new AppError('Department operation unavailable', 503); }
}
async function normalized(tx, name) { const rows = await tx.$queryRaw`SELECT public.department_normalize(${name}) AS value`; return rows[0].value; }
async function get(tx, id, version) { const row = await tx.department.findUnique({ where: { id }, select }); if (!row) throw new AppError('Department not found', 404); if (version !== undefined && row.version !== version) throw conflict(); return row; }
const audit = (tx, actor, requestId, id, eventType, metadata = {}) => tx.auditEvent.create({ data: { entityType: 'department', entityId: id, actorUserId: actor.id, requestId, eventType, metadata } });
async function list(input, activeOnly = false) {
  const q = parse(activeOnly ? schemas.options : schemas.list, input);
  const where = { ...(activeOnly || q.status !== 'ALL' ? { isActive: activeOnly || q.status === 'ACTIVE' } : {}), ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) };
  const [rows, total] = await Promise.all([prisma.department.findMany({ where, select: activeOnly ? { id: true, name: true } : { ...select, _count: { select: { users: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.limit, take: q.limit }), prisma.department.count({ where })]);
  let departments = rows;
  if (!activeOnly) {
    const counts = await prisma.user.groupBy({ by: ['departmentId'], where: { departmentId: { in: rows.map((r) => r.id) }, isActive: true, role: 'AGENT' }, _count: { _all: true } });
    departments = rows.map(({ _count, ...row }) => ({ ...row, memberCount: _count.users, activeAgentCount: counts.find((c) => c.departmentId === row.id)?._count._all || 0 }));
  }
  return { departments, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
}
async function members(id, input) {
  const q = parse(schemas.members, input); const department = await get(prisma, id);
  const where = { departmentId: id };
  const [users, total] = await Promise.all([prisma.user.findMany({ where, select: { id: true, name: true, role: true, isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: q.limit, skip: (q.page - 1) * q.limit }), prisma.user.count({ where })]);
  return { department, users, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
}
async function create(actor, input, requestId) {
  const body = parse(schemas.create, input);
  return transaction(actor, async (tx) => { const row = await tx.department.create({ data: { ...body, normalizedName: await normalized(tx, body.name) }, select }); await audit(tx, actor, requestId, row.id, 'department.created'); return row; });
}
async function update(actor, id, input, requestId) {
  const { version, ...body } = parse(schemas.update, input);
  return transaction(actor, async (tx) => { await get(tx, id, version); const row = await tx.department.update({ where: { id, version }, data: { ...body, normalizedName: await normalized(tx, body.name), version: { increment: 1 } }, select }); await audit(tx, actor, requestId, id, 'department.updated', { changedFields: ['name', 'description'] }); return row; });
}
async function status(actor, id, input, requestId) {
  const body = parse(schemas.status, input);
  return transaction(actor, async (tx) => { const current = await get(tx, id, body.version); if (current.isActive === body.isActive) throw conflict(); const members = await tx.user.count({ where: { departmentId: id } }); const row = await tx.department.update({ where: { id, version: body.version }, data: { isActive: body.isActive, version: { increment: 1 } }, select }); await audit(tx, actor, requestId, id, body.isActive ? 'department.activated' : 'department.deactivated', { memberCount: members }); return row; });
}
async function merge(actor, id, input, requestId) {
  const body = parse(schemas.merge, input); if (id === body.targetId) throw new AppError('Source and target must differ', 422);
  return transaction(actor, async (tx) => {
    await get(tx, id, body.version); const target = await get(tx, body.targetId, body.targetVersion);
    if (!target.isActive) throw new AppError('Select an active target department', 409);
    const moved = await tx.user.updateMany({ where: { departmentId: id }, data: { departmentId: target.id } });
    await tx.department.update({ where: { id, version: body.version }, data: { isActive: false, version: { increment: 1 } } });
    await tx.department.update({ where: { id: target.id, version: body.targetVersion }, data: { version: { increment: 1 } } });
    await audit(tx, actor, requestId, id, 'department.merged', { targetId: target.id, memberCount: moved.count });
    return { movedMembers: moved.count, targetId: target.id };
  });
}
// Shared by Settings and Admin reassignment. Existing inactive links may be
// retained on a name-only save; every new link must point at an active row.
async function setMembership(tx, userId, departmentId, previousDepartmentId) {
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
  const current = await tx.user.findUnique({ where: { id: userId }, select: { id: true, ...departmentSelect } });
  if (!current) throw new AppError('User not found', 404);
  if (previousDepartmentId !== undefined && (current.departmentId || null) !== previousDepartmentId) throw conflict();
  if (departmentId) { const department = await get(tx, departmentId); if (!department.isActive && departmentId !== current.departmentId) throw new AppError('Select an active department', 409); }
  if ((current.departmentId || null) !== departmentId) {
    await tx.department.updateMany({ where: { id: { in: [current.departmentId, departmentId].filter(Boolean) } }, data: { version: { increment: 1 } } });
  }
  return tx.user.update({ where: { id: userId }, data: { departmentId, ...(departmentId === null ? { department: null } : {}) }, select: { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true, createdAt: true, ...departmentSelect } });
}
async function assign(actor, userId, input, requestId) {
  const body = parse(schemas.assign, input);
  return transaction(actor, async (tx) => { const row = await setMembership(tx, userId, body.departmentId, body.previousDepartmentId); await tx.auditEvent.create({ data: { eventType: 'user.department_changed', entityType: 'user', entityId: userId, actorUserId: actor.id, requestId, metadata: { previousDepartmentId: body.previousDepartmentId, departmentId: body.departmentId } } }); return exposeDepartment(row); });
}
module.exports = { select, transaction, list, members, create, update, status, merge, setMembership, assign };
