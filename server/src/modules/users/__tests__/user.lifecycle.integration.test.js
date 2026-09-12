/*
 * This suite deliberately uses the real Express app, authentication middleware,
 * and PostgreSQL only when pointed at an explicitly enabled, local test database.
 * It never migrates, resets, or deletes rows it did not create.
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const DEFAULT_JEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
if (process.env.DATABASE_URL === DEFAULT_JEST_DATABASE_URL) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
}

const localDatabaseIsSafe = () => {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    const explicitlyAllowedLocalDatabase = process.env.ALLOW_NON_TEST_DB_INTEGRATION === 'true';
    return localHosts.has(url.hostname) && (/test/i.test(url.pathname) || explicitlyAllowedLocalDatabase);
  } catch {
    return false;
  }
};

const dbIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true' && localDatabaseIsSafe();
const describeDb = dbIntegrationEnabled ? describe : describe.skip;
const skipReason = 'requires RUN_DB_INTEGRATION_TESTS=true and a local PostgreSQL test database (or explicit ALLOW_NON_TEST_DB_INTEGRATION=true)';

describeDb(`user lifecycle routes (${skipReason})`, () => {
  const app = require('../../../app');
  const prisma = require('../../../config/prisma');
  const { signToken } = require('../../../utils/jwt');
  const createdUserIds = [];
  const createdTicketIds = [];
  const prefix = `lifecycle-it-${randomUUID()}`;
  let server;
  let baseUrl;
  let actor;

  const createUser = async ({ role = 'USER', isActive = true, emailVerified = true, name = 'Lifecycle Test User' } = {}) => {
    const user = await prisma.user.create({
      data: {
        name,
        email: `${prefix}-${randomUUID()}@example.test`,
        password: await bcrypt.hash('Password123!', 12),
        role,
        isActive,
        emailVerified,
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  const request = async (path, { token, method = 'PATCH', body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };

  const auditCount = (entityId) => prisma.auditEvent.count({ where: { entityType: 'user', entityId } });
  let barrier = null; let rejectAuditFor = null; let reconciliationReady = null;
  prisma.$use(async (params, next) => {
    if (rejectAuditFor && params.model === 'AuditEvent' && params.action === 'create' && params.args.data.entityId === rejectAuditFor) throw new Error('Injected fixture audit failure');
    if (barrier?.entered && params.model === 'User' && params.action === 'update' && params.args.where.id === barrier.id) barrier.waiting();
    if (reconciliationReady && params.action === 'queryRaw' && JSON.stringify(params.args).includes('tickets')) reconciliationReady();
    const result = await next(params);
    if (barrier && !barrier.entered && params.model === 'User' && params.action === 'findUnique' && params.args.where.id === barrier.id) { barrier.entered = true; barrier.ready(); await barrier.release; }
    return result;
  });

  beforeAll(async () => {
    await prisma.$connect();
    actor = await createUser({ role: 'ADMIN', name: 'Lifecycle Actor' });
    await createUser({ role: 'ADMIN', name: 'Lifecycle Spare Admin' });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (createdTicketIds.length) {
      await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdUserIds.length) {
      await prisma.notification.deleteMany({
        where: { OR: [{ recipientId: { in: createdUserIds } }, { actorId: { in: createdUserIds } }] },
      });
      await prisma.auditEvent.deleteMany({ where: { entityId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    expect(await prisma.user.count({ where: { id: { in: createdUserIds } } })).toBe(0);
    expect(await prisma.ticket.count({ where: { id: { in: createdTicketIds } } })).toBe(0);
    expect(await prisma.notification.count({ where: { recipientId: { in: createdUserIds } } })).toBe(0);
    expect(await prisma.ticketWatcher.count({ where: { userId: { in: createdUserIds } } })).toBe(0);
    console.log('Lifecycle fixtures cleaned: users/tickets/notifications/watchers=0');
    await prisma.$disconnect();
  });

  test('1. admin role changes return a safe projection including emailVerified', async () => {
    const target = await createUser({ role: 'USER', emailVerified: false });
    const result = await request(`/users/${target.id}/role`, { token: signToken({ sub: actor.id, role: actor.role }), body: { role: 'AGENT' } });

    expect(result.status).toBe(200);
    expect(result.body.data.user).toMatchObject({ id: target.id, role: 'AGENT', emailVerified: false });
    expect(result.body.data.user).not.toHaveProperty('password');
  });

  test('2. non-admins cannot mutate lifecycle routes', async () => {
    const target = await createUser();
    const nonAdmin = await createUser({ role: 'AGENT' });
    const result = await request(`/users/${target.id}/status`, { token: signToken({ sub: nonAdmin.id, role: nonAdmin.role }), body: { isActive: false } });

    expect(result.status).toBe(403);
  });

  test('3. lifecycle schemas reject mass-assignment fields', async () => {
    const target = await createUser();
    const result = await request(`/users/${target.id}/status`, { token: signToken({ sub: actor.id, role: actor.role }), body: { isActive: false, role: 'ADMIN' } });

    expect(result.status).toBe(422);
  });

  test('4. an admin cannot demote themself and no audit entry is written', async () => {
    const before = await auditCount(actor.id);
    const result = await request(`/users/${actor.id}/role`, { token: signToken({ sub: actor.id, role: actor.role }), body: { role: 'AGENT' } });

    expect(result.status).toBe(403);
    expect(await auditCount(actor.id)).toBe(before);
  });

  test('5. an admin cannot deactivate themself and no audit entry is written', async () => {
    const before = await auditCount(actor.id);
    const result = await request(`/users/${actor.id}/deactivate`, { token: signToken({ sub: actor.id, role: actor.role }), body: {} });

    expect(result.status).toBe(403);
    expect(await auditCount(actor.id)).toBe(before);
  });

  test('6. an active admin demotion is audited transactionally', async () => {
    const target = await createUser({ role: 'ADMIN' });
    const result = await request(`/users/${target.id}/role`, { token: signToken({ sub: actor.id, role: actor.role }), body: { role: 'AGENT' } });

    expect(result.status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { entityId: target.id, eventType: 'user.role_changed' } })).toBe(1);
  });

  test('7. generic status deactivation unassigns unresolved tickets, writes history, and audits', async () => {
    const target = await createUser({ role: 'AGENT' });
    const creator = await createUser();
    const ticket = await prisma.ticket.create({
      data: { title: `${prefix}-ticket`, description: 'Lifecycle integration test ticket', category: 'OTHERS', createdById: creator.id, assignedToId: target.id },
    });
    createdTicketIds.push(ticket.id);
    const result = await request(`/users/${target.id}/status`, { token: signToken({ sub: actor.id, role: actor.role }), body: { isActive: false } });

    expect(result.status).toBe(200);
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).assignedToId).toBeNull();
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'UNASSIGNED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: target.id, eventType: 'user.deactivated' } })).toBe(1);
  });

  test('8. a completed deactivation cannot be repeated', async () => {
    const target = await createUser({ role: 'AGENT', isActive: false });
    const result = await request(`/users/${target.id}/deactivate`, { token: signToken({ sub: actor.id, role: actor.role }), body: {} });

    expect(result.status).toBe(409);
    expect(await auditCount(target.id)).toBe(0);
  });

  test('9. generic status reactivation uses the same policy and audit trail', async () => {
    const target = await createUser({ role: 'AGENT', isActive: false });
    const result = await request(`/users/${target.id}/status`, { token: signToken({ sub: actor.id, role: actor.role }), body: { isActive: true } });

    expect(result.status).toBe(200);
    expect(result.body.data.user).toMatchObject({ id: target.id, isActive: true });
    expect(await prisma.auditEvent.count({ where: { entityId: target.id, eventType: 'USER_REACTIVATED' } })).toBe(1);
  });

  test('10. invalid UUID lifecycle requests preserve the validation convention', async () => {
    const result = await request('/users/not-a-uuid/status', { token: signToken({ sub: actor.id, role: actor.role }), body: { isActive: false } });

    expect(result.status).toBe(422);
  });

  test('11. dedicated lifecycle routes reject unexpected body fields', async () => {
    const target = await createUser({ role: 'AGENT' });
    const result = await request(`/users/${target.id}/deactivate`, {
      token: signToken({ sub: actor.id, role: actor.role }),
      body: { role: 'ADMIN' },
    });

    expect(result.status).toBe(422);
    expect((await prisma.user.findUnique({ where: { id: target.id } })).isActive).toBe(true);
    expect(await auditCount(target.id)).toBe(0);
  });

  test('12. demotion to USER unassigns unresolved tickets and records the transition', async () => {
    const target = await createUser({ role: 'AGENT' });
    const creator = await createUser();
    const ticket = await prisma.ticket.create({
      data: { title: `${prefix}-role-ticket`, description: 'Role lifecycle integration test ticket', category: 'OTHERS', createdById: creator.id, assignedToId: target.id },
    });
    createdTicketIds.push(ticket.id);

    const result = await request(`/users/${target.id}/role`, {
      token: signToken({ sub: actor.id, role: actor.role }),
      body: { role: 'USER' },
    });

    expect(result.status).toBe(200);
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).assignedToId).toBeNull();
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'UNASSIGNED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: target.id, eventType: 'user.role_changed' } })).toBe(1);
  });

  test('Admin directory metrics, pagination, filters, details and strict safe projections', async () => {
    const token = signToken({ sub: actor.id, role: actor.role });
    const summary = await request('/users/summary', { token, method: 'GET' });
    expect(summary.status).toBe(200); expect(summary.body.data.total).toBe(await prisma.user.count());
    const result = await request(`/users?status=ALL&search=${encodeURIComponent(prefix)}&limit=2&page=1&sort=name`, { token, method: 'GET' });
    expect(result.status).toBe(200); expect(result.body.data.users).toHaveLength(2); expect(result.body.data.pagination.total).toBe(createdUserIds.length);
    expect(result.body.data.users.every((row) => !('password' in row) && typeof row.activeWorkload === 'number')).toBe(true);
    const details = await request(`/users/${actor.id}/details`, { token, method: 'GET' });
    expect(details.status).toBe(200); expect(details.body.data.user).not.toHaveProperty('password');
    expect(details.body.data.lifecycle.every((entry) => !('metadata' in entry))).toBe(true);
    expect((await request('/users?userId=other', { token, method: 'GET' })).status).toBe(422);
    for (const role of ['USER', 'AGENT']) { const account = await createUser({ role }); const forbidden = signToken({ sub: account.id, role });
      for (const path of ['/users', '/users/summary', `/users/${actor.id}/details`]) expect((await request(path, { token: forbidden, method: 'GET' })).status).toBe(403);
    }
  });
  test('overlapping assignment and deactivation do not leave unresolved work assigned to an inactive account', async () => {
    const target = await createUser({ role: 'AGENT' });
    const ticket = await prisma.ticket.create({ data: { title: prefix, description: 'Concurrent fixture', createdById: actor.id } }); createdTicketIds.push(ticket.id);
    let ready, waiting, release;
    const started = new Promise((resolve) => { ready = resolve; }); const blocked = new Promise((resolve) => { waiting = resolve; });
    barrier = { id: target.id, entered: false, ready, waiting, release: new Promise((resolve) => { release = resolve; }) };
    try {
      const assignment = require('../../tickets/ticket.service').assignTicket(ticket.id, target.id, actor);
      await started;
      const deactivation = require('../user.service').deactivateUser(target.id, actor);
      await Promise.race([blocked, deactivation]); release(); await assignment; await deactivation;
      expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).assignedToId).toBeNull();
      expect((await prisma.user.findUnique({ where: { id: target.id } })).isActive).toBe(false);
    } finally { release(); barrier = null; }
  });
  test('competing Admin lifecycle requests revalidate actors and cannot revoke both accounts', async () => {
    const first = await createUser({ role: 'ADMIN' }); const second = await createUser({ role: 'ADMIN' }); const service = require('../user.service');
    const results = await Promise.allSettled([service.deactivateUser(second.id, first), service.deactivateUser(first.id, second)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(403);
    expect(await prisma.user.count({ where: { id: { in: [first.id, second.id] }, isActive: true, role: 'ADMIN' } })).toBe(1);
  });
  test('a concurrent committed resolution is preserved by account reconciliation', async () => {
    const target = await createUser({ role: 'AGENT' });
    const ticket = await prisma.ticket.create({ data: { title: prefix, description: 'Resolution race fixture', createdById: actor.id, assignedToId: target.id } }); createdTicketIds.push(ticket.id);
    let entered, release, ready;
    const started = new Promise((resolve) => { entered = resolve; });
    const finish = new Promise((resolve) => { release = resolve; });
    const waiting = new Promise((resolve) => { ready = resolve; });
    reconciliationReady = ready;
    const resolution = prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'RESOLVED' } }); entered(); await finish;
    });
    try {
      await started;
      const deactivation = require('../user.service').deactivateUser(target.id, actor);
      await Promise.race([waiting, deactivation]); release(); await resolution;
      expect((await deactivation).unassignedTickets).toBe(0);
      expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toMatchObject({ status: 'RESOLVED', assignedToId: target.id });
      expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'UNASSIGNED' } })).toBe(0);
    } finally { release(); reconciliationReady = null; await resolution; }
  });
  test('audit failure rolls back role and assignment reconciliation; preserved watchers remain', async () => {
    const target = await createUser({ role: 'AGENT' }); const ticket = await prisma.ticket.create({ data: { title: prefix, description: 'Rollback fixture', createdById: actor.id, assignedToId: target.id } }); createdTicketIds.push(ticket.id);
    await require('../../watchers/watcher.service').watching(target, ticket.id, 'watch');
    rejectAuditFor = target.id;
    try { await expect(require('../user.service').updateUserRole(target.id, 'USER', actor)).rejects.toThrow('Injected fixture audit failure'); }
    finally { rejectAuditFor = null; }
    expect((await prisma.user.findUnique({ where: { id: target.id } })).role).toBe('AGENT');
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).assignedToId).toBe(target.id);
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(await prisma.ticketWatcher.count({ where: { userId: target.id, ticketId: ticket.id } })).toBe(1);
  });
  test('profile API normalizes name, clears membership explicitly and rejects legacy/privileged fields', async () => {
    const target = await createUser(); const token = signToken({ sub: target.id, role: target.role });
    const result = await request('/settings/me', { token, body: { name: ' Updated Name ', departmentId: null, previousDepartmentId: null } });
    expect(result.status).toBe(200); expect(result.body.data.user).toMatchObject({ name: 'Updated Name', department: null, role: 'USER' });
    expect((await request('/settings/me', { token, body: { name: 'Safe', departmentId: null, previousDepartmentId: null, role: 'ADMIN' } })).status).toBe(422);
    expect((await prisma.user.findUnique({ where: { id: target.id } })).role).toBe('USER');
    expect((await request('/settings/me', { token, body: { name: 'Safe', department: 'Free text' } })).status).toBe(422);
  });
  test('13. assignment candidates are staff-only and expose only assignment fields', async () => {
    const requester = await createUser({ role: 'USER' });
    const requesterResult = await request('/users/agents', {
      method: 'GET',
      token: signToken({ sub: requester.id, role: requester.role }),
    });
    const adminResult = await request('/users/agents', {
      method: 'GET',
      token: signToken({ sub: actor.id, role: actor.role }),
    });

    expect(requesterResult.status).toBe(403);
    expect(adminResult.status).toBe(200);
    expect(adminResult.body.data.agents.length).toBeGreaterThan(0);
    for (const candidate of adminResult.body.data.agents) {
      expect(Object.keys(candidate).sort()).toEqual(['id', 'name', 'role']);
    }
  });
});

if (!dbIntegrationEnabled) {
  test.skip(`DB lifecycle integration skipped: ${skipReason}`, () => {});
}
