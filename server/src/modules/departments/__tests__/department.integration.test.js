// Opt-in only after the separately approved Department migration. No DDL,
// migration, email, reset, or cleanup outside IDs created by this suite.
const { randomUUID, createHash } = require('crypto');
const enabled = process.env.RUN_DEPARTMENT_DB_TESTS === 'true';
if (enabled && process.env.DATABASE_URL === 'postgresql://test:test@localhost:5432/test_db') require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
if (enabled) {
  const target = new URL(process.env.DATABASE_URL);
  if (target.hostname !== 'localhost' || (target.port || '5432') !== '5432' || target.pathname !== '/ticketing_db' || (target.searchParams.get('schema') || 'public') !== 'public') throw new Error('Department test target mismatch (redacted)');
  process.env.EMAIL_PROVIDER = 'disabled';
}
(enabled ? describe : describe.skip)('Department database integrity and concurrency', () => {
  const db = require('../../../config/prisma'); const service = require('../department.service');
  const settings = require('../../settings/settings.service'); const { departmentName } = require('../department.projection');
  const users = [], departments = [], tickets = []; const prefix = `department-it-${randomUUID()}`;
  let actor, rejectAudit = null;
  db.$use((params, next) => { if (rejectAudit && params.model === 'AuditEvent' && params.action === 'create' && params.args.data.entityId === rejectAudit) throw new Error('Synthetic audit failure'); return next(params); });
  async function account(role = 'USER') { const id = randomUUID(); users.push(id); return db.user.create({ data: { id, name: prefix, email: `${prefix}-${id}@example.test`, password: 'unused-fixture', role, emailVerified: true } }); }
  async function department(label) { const row = await service.create(actor, { name: `${prefix} ${label}` }); departments.push(row.id); return row; }
  beforeAll(async () => {
    const rows = await db.$queryRaw`SELECT checksum FROM "_prisma_migrations" WHERE migration_name = '20260912010000_add_department_administration' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../../../prisma/migrations/20260912010000_add_department_administration/migration.sql'));
    expect(rows).toHaveLength(1); expect(rows[0].checksum).toBe(createHash('sha256').update(sql).digest('hex'));
    actor = await account('ADMIN');
  });
  afterAll(async () => {
    try {
      await db.ticketResolutionCycle.deleteMany({ where: { ticketId: { in: tickets } } });
      await db.ticket.deleteMany({ where: { id: { in: tickets } } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { entityId: { in: departments } }] } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.department.deleteMany({ where: { id: { in: departments } } });
      expect(await db.user.count({ where: { id: { in: users } } })).toBe(0);
      expect(await db.department.count({ where: { id: { in: departments } } })).toBe(0);
      expect(await db.ticket.count({ where: { id: { in: tickets } } })).toBe(0);
      expect(await db.auditEvent.count({ where: { actorUserId: { in: users } } })).toBe(0);
      console.log('Department synthetic fixture cleanup: users/departments/tickets/audits=0');
    } finally { await db.$disconnect(); }
  });
  test('backfill links valid legacy values and leaves empty values unlinked; database normalization is case-insensitive', async () => {
    const invalid = await db.$queryRaw`SELECT count(*)::int AS count FROM users WHERE "departmentId" IS NULL AND char_length(regexp_replace(department, '^[[:space:]]+|[[:space:]]+$', '', 'g')) BETWEEN 2 AND 100 AND regexp_replace(department, '^[[:space:]]+|[[:space:]]+$', '', 'g') !~ '[[:cntrl:]]'`;
    expect(invalid[0].count).toBe(0);
    const blankLinks = await db.$queryRaw`SELECT count(*)::int AS count FROM users WHERE (department IS NULL OR regexp_replace(department, '^[[:space:]]+|[[:space:]]+$', '', 'g') = '') AND "departmentId" IS NOT NULL`;
    expect(blankLinks[0].count).toBe(0);
    const rows = await db.$queryRaw`SELECT public.department_normalize('  Support  ') AS a, public.department_normalize('SUPPORT') AS b, public.department_normalize('   ') AS blank`;
    expect(rows[0]).toEqual({ a: 'support', b: 'support', blank: '' });
  });
  test('normalized duplicate rejection and database constraints', async () => {
    const row = await department('Duplicate');
    await expect(service.create(actor, { name: row.name.toUpperCase() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(db.department.update({ where: { id: row.id }, data: { normalizedName: 'wrong' } })).rejects.toBeDefined();
    await expect(db.department.update({ where: { id: row.id }, data: { version: 0 } })).rejects.toBeDefined();
    expect((await db.department.findUnique({ where: { id: row.id } })).version).toBe(1);
  });
  test('PostgreSQL has the expected checks, indexes and restrictive user foreign key', async () => {
    const checks = await db.$queryRaw`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('public.departments'::regclass, 'public.users'::regclass)`;
    for (const name of ['departments_name_check', 'departments_normalized_check', 'departments_description_check', 'departments_version_check']) expect(checks.some((row) => row.conname === name && row.definition.includes('CHECK'))).toBe(true);
    expect(checks.find((row) => row.conname === 'users_departmentId_fkey').definition).toContain('ON DELETE RESTRICT');
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('departments', 'users')`;
    for (const name of ['departments_normalizedName_key', 'departments_isActive_name_id_idx', 'users_departmentId_isActive_role_idx']) expect(indexes.some((row) => row.indexname === name)).toBe(true);
  });
  test('active selection, inactive retention, null clearing, new inactive rejection and member counts', async () => {
    const row = await department('Membership'); const member = await account('AGENT'); const other = await account();
    await settings.updateMyProfile(member.id, { name: prefix, departmentId: row.id, previousDepartmentId: null });
    let current = await db.department.findUnique({ where: { id: row.id } });
    const listed = await service.list({ search: row.name }); expect(listed.departments[0]).toMatchObject({ memberCount: 1, activeAgentCount: 1 });
    await service.status(actor, row.id, { version: current.version, isActive: false });
    expect(departmentName(await settings.getMySettings(member.id))).toBe(row.name);
    await settings.updateMyProfile(member.id, { name: prefix });
    await expect(settings.updateMyProfile(other.id, { name: prefix, departmentId: row.id, previousDepartmentId: null })).rejects.toMatchObject({ statusCode: 409 });
    await settings.updateMyProfile(member.id, { name: prefix, departmentId: null, previousDepartmentId: row.id });
    expect(await db.user.findUnique({ where: { id: member.id } })).toMatchObject({ departmentId: null, department: null });
  });
  test('merge changes current associations only, preserves legacy and historical snapshots', async () => {
    const source = await department('Source'); const target = await department('Target'); const member = await account();
    await db.user.update({ where: { id: member.id }, data: { department: 'Preserved Legacy' } });
    await service.assign(actor, member.id, { departmentId: source.id, previousDepartmentId: null });
    const ticket = await db.ticket.create({ data: { title: prefix, description: 'Synthetic snapshot fixture', createdById: member.id } }); tickets.push(ticket.id);
    const cycle = await db.ticketResolutionCycle.create({ data: { ticketId: ticket.id, number: 1, requesterId: member.id, departmentSnapshot: 'Immutable History', resolvedAt: new Date() } });
    const before = await db.department.findUnique({ where: { id: source.id } });
    expect(await service.merge(actor, source.id, { version: before.version, targetId: target.id, targetVersion: target.version })).toMatchObject({ movedMembers: 1 });
    expect(await db.user.findUnique({ where: { id: member.id } })).toMatchObject({ departmentId: target.id, department: 'Preserved Legacy' });
    expect((await db.department.findUnique({ where: { id: source.id } })).isActive).toBe(false);
    expect((await db.ticketResolutionCycle.findUnique({ where: { id: cycle.id } })).departmentSnapshot).toBe('Immutable History');
    const renamed = await db.department.findUnique({ where: { id: target.id } });
    await service.update(actor, target.id, { version: renamed.version, name: `${target.name} renamed` });
    expect((await db.ticketResolutionCycle.findUnique({ where: { id: cycle.id } })).departmentSnapshot).toBe('Immutable History');
  });
  test('audit failure rolls back merge associations and both versions', async () => {
    const source = await department('Rollback source'); const target = await department('Rollback target'); const member = await account();
    await service.assign(actor, member.id, { departmentId: source.id, previousDepartmentId: null }); const before = await db.department.findUnique({ where: { id: source.id } });
    rejectAudit = source.id;
    try { await expect(service.merge(actor, source.id, { version: before.version, targetId: target.id, targetVersion: target.version })).rejects.toMatchObject({ statusCode: 503 }); } finally { rejectAudit = null; }
    expect((await db.user.findUnique({ where: { id: member.id } })).departmentId).toBe(source.id);
    expect(await db.department.findUnique({ where: { id: source.id } })).toMatchObject({ version: before.version, isActive: true });
    expect((await db.department.findUnique({ where: { id: target.id } })).version).toBe(target.version);
  });
  test('concurrent merge/update requests have one version winner; stale member reassignment rejects', async () => {
    const source = await department('Race source'); const target = await department('Race target');
    const results = await Promise.allSettled([service.merge(actor, source.id, { version: 1, targetId: target.id, targetVersion: 1 }), service.update(actor, target.id, { version: 1, name: `${target.name} updated` })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
    const member = await account(); await service.assign(actor, member.id, { departmentId: target.id, previousDepartmentId: null });
    await expect(service.assign(actor, member.id, { departmentId: null, previousDepartmentId: null })).rejects.toMatchObject({ statusCode: 409 });
  });
  test('Department foreign key refuses deletion while a member is linked', async () => {
    const row = await department('Restrict'); const member = await account(); await service.assign(actor, member.id, { departmentId: row.id, previousDepartmentId: null });
    // Direct database test: there is deliberately no Department delete API.
    // PostgreSQL RESTRICT may be wrapped as 23001 rather than Prisma P2003.
    // Require this exact FK, not merely any rejected database operation.
    const { Prisma } = require('@prisma/client');
    const isMembershipRestriction = (error) => {
      const namedConstraint = `${error?.meta?.field_name || ''} ${error?.message || ''}`.includes('users_departmentId_fkey');
      return namedConstraint && (
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') ||
        (error instanceof Prisma.PrismaClientUnknownRequestError && /code: "23001"/.test(error.message) && /violates RESTRICT setting/.test(error.message))
      );
    };
    expect(isMembershipRestriction(new Error('users_departmentId_fkey'))).toBe(false);
    expect(isMembershipRestriction(new Prisma.PrismaClientUnknownRequestError('connection unavailable', { clientVersion: Prisma.prismaVersion.client }))).toBe(false);
    const beforeDepartment = await db.department.findUnique({ where: { id: row.id } });
    const beforeUser = await db.user.findUnique({ where: { id: member.id } });
    const beforeAudits = await db.auditEvent.count();
    const result = await db.department.delete({ where: { id: row.id } }).then(
      () => ({ rejected: false, restriction: false }),
      (error) => ({ rejected: true, restriction: isMembershipRestriction(error) }),
    );
    // Only booleans are asserted for errors/row equality: no raw driver details
    // or account fields are printed even if a regression makes this test fail.
    expect(result).toEqual({ rejected: true, restriction: true });
    const afterDepartment = await db.department.findUnique({ where: { id: row.id } });
    const afterUser = await db.user.findUnique({ where: { id: member.id } });
    expect(afterDepartment !== null).toBe(true);
    expect(afterUser !== null).toBe(true);
    expect(afterUser?.departmentId === row.id).toBe(true);
    expect(JSON.stringify(afterDepartment) === JSON.stringify(beforeDepartment)).toBe(true);
    expect(JSON.stringify(afterUser) === JSON.stringify(beforeUser)).toBe(true);
    expect(await db.auditEvent.count()).toBe(beforeAudits);
  });
});
