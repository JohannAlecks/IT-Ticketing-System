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
