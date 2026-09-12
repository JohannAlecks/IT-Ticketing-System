// Explicit opt-in AFTER migration approval. Only this suite's UUID fixtures
// may be removed. No migration, reset, email, or existing-ticket mutation.
const { randomUUID } = require('crypto');
const { enabled, describeDb } = require('../../../../testUtils/databaseSuite');
const skipReason = 'requires the centralized dedicated test-database guard';
(enabled ? describe : describe.skip)('personal preferences local database and concurrency', () => {
  const db = require('../../../config/prisma');
  const service = require('../personal.service');
  const prefix = `personal-it-${randomUUID()}`;
  const userIds = [];
  const viewIds = [];
  const shortcutIds = [];
  async function account(role = 'USER') {
    const id = randomUUID(); userIds.push(id);
    return db.user.create({ data: { id, name: prefix, email: `${prefix}-${id}@example.test`, password: 'unused-test-fixture', role, emailVerified: true } });
  }
  async function view(user, name = 'Open', scope = 'MY_TICKETS') {
    const result = await service.createView(user, { name, scope, filters: { status: 'OPEN' } }); viewIds.push(result.id); return result;
  }
  async function shortcut(user, routeKey = 'SUMMARY') {
    const result = await service.createShortcut(user, { label: routeKey, targetType: 'ROUTE', routeKey }); shortcutIds.push(result.id); return result;
  }
  beforeAll(async () => {
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20260911000000_add_saved_views_shortcuts' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (applied.length !== 1) throw new Error('Personal preferences migration must be applied exactly once first');
  });
  afterAll(async () => {
    try {
      // User deletion cascades only these newly created preference fixtures.
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      expect(await db.user.count({ where: { id: { in: userIds } } })).toBe(0);
      expect(await db.savedTicketView.count({ where: { userId: { in: userIds } } })).toBe(0);
      expect(await db.userShortcut.count({ where: { userId: { in: userIds } } })).toBe(0);
      expect(await db.savedTicketView.count({ where: { id: { in: viewIds } } })).toBe(0);
      expect(await db.userShortcut.count({ where: { id: { in: shortcutIds } } })).toBe(0);
      console.log('Personal fixture cleanup verified: users/views/shortcuts=0; no ticket fixtures created');
    } finally { await db.$disconnect(); }
  });
  test('simultaneous view creates enforce 20-record cap and normalized uniqueness', async () => {
    const user = await account();
    const results = await Promise.allSettled(Array.from({ length: 21 }, (_, n) => view(user, `View ${n}`)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.statusCode === 409)).toBe(true);
    expect(await db.savedTicketView.count({ where: { userId: user.id } })).toBe(20);
    const other = await account();
    const duplicates = await Promise.allSettled([view(other, 'Same'), view(other, 'ＳＡＭＥ')]);
    expect(duplicates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(duplicates.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
  });
  test('simultaneous shortcut creates enforce eight targets, duplicates and position uniqueness', async () => {
    const user = await account('ADMIN');
    const keys = ['SUMMARY', 'GET_STARTED', 'CREATE_TICKET', 'ARCHIVED_WORK', 'KNOWLEDGE_BASE', 'NOTIFICATIONS', 'SETTINGS', 'USERS', 'AUDIT_LOGS'];
    const results = await Promise.allSettled(keys.map((key) => shortcut(user, key)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    const rows = (await service.listShortcuts(user)).shortcuts;
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Exercise every parking slot, including 15, through the real service.
    const reversed = [...rows].reverse().map(({ id, version }) => ({ id, version }));
    const reordered = (await service.reorderShortcuts(user, { items: reversed })).shortcuts;
    expect(reordered.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(reordered.map((r) => r.id)).toEqual(reversed.map((r) => r.id));
    const other = await account();
    const dup = await Promise.allSettled([shortcut(other), shortcut(other)]);
    expect(dup.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  test('owner isolation includes Admin; archived and assigned execution reuse normal authorization', async () => {
    const owner = await account(); const other = await account(); const admin = await account('ADMIN'); const agent = await account('AGENT');
    const saved = await view(owner);
    for (const outsider of [other, admin]) {
      await expect(service.executeView(outsider, saved.id, {})).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.updateView(outsider, saved.id, { version: 1, name: 'Stolen' })).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.deleteView(outsider, saved.id, { version: 1 })).rejects.toMatchObject({ statusCode: 404 });
    }
    expect((await service.executeView(owner, saved.id, {})).tickets).toEqual([]);
    const assigned = await view(agent, 'Assigned', 'ASSIGNED_TO_ME');
    expect((await service.executeView(agent, assigned.id, {})).tickets).toEqual([]);
    const archived = await view(owner, 'Archived', 'ARCHIVED');
    expect((await service.executeView(owner, archived.id, {})).tickets).toEqual([]);
  });
  test('role downgrade and deactivation preserve records but remove usable links', async () => {
    const user = await account('ADMIN'); const saved = await view(user, 'All', 'ALL_AUTHORIZED'); await shortcut(user, 'USERS');
    await db.user.update({ where: { id: user.id }, data: { role: 'USER', isActive: false } });
    await expect(service.listShortcuts(user)).rejects.toMatchObject({ statusCode: 401 });
    expect(await db.savedTicketView.count({ where: { userId: user.id } })).toBe(1);
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
    await expect(service.executeView(user, saved.id, {})).rejects.toMatchObject({ statusCode: 404 });
    const row = (await service.listShortcuts(user)).shortcuts[0]; expect(row.available).toBe(false); expect(row.path).toBeUndefined();
    await service.updateShortcut(user, row.id, { version: row.version }, true);
  });
  test('competing updates/reorders detect stale versions; view delete cascades and compacts positions', async () => {
    const user = await account(); const saved = await view(user); await shortcut(user);
    const linked = await service.createShortcut(user, { label: 'Saved', targetType: 'SAVED_VIEW', savedViewId: saved.id }); shortcutIds.push(linked.id);
    await shortcut(user, 'SETTINGS');
    const updates = await Promise.allSettled(['One', 'Two'].map((name) => service.updateView(user, saved.id, { version: 1, name })));
    expect(updates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const items = (await service.listShortcuts(user)).shortcuts.map(({ id, version }) => ({ id, version }));
    const reorders = await Promise.allSettled([service.reorderShortcuts(user, { items: [...items].reverse() }), service.reorderShortcuts(user, { items })]);
    expect(reorders.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(reorders.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
    const ordered = (await service.listShortcuts(user)).shortcuts;
    expect(ordered.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(new Set(ordered.map((r) => r.id))).toEqual(new Set(items.map((r) => r.id)));
    await service.deleteView(user, saved.id, { version: 2 });
    expect(await db.userShortcut.count({ where: { savedViewId: saved.id } })).toBe(0);
    expect((await service.listShortcuts(user)).shortcuts.map((r) => r.position)).toEqual([0, 1]);
  });
  test('cross-owner saved-view references are rejected by database FK and reorder cannot use foreign IDs', async () => {
    const owner = await account(); const other = await account(); const saved = await view(owner);
    await expect(db.userShortcut.create({ data: { userId: other.id, label: 'Invalid', targetType: 'SAVED_VIEW', savedViewId: saved.id, targetKey: `view:${saved.id}`, position: 0 } })).rejects.toMatchObject({ code: 'P2003' });
    const own = await shortcut(owner); const foreign = await shortcut(other);
    const before = await db.userShortcut.findMany({ where: { userId: { in: [owner.id, other.id] } }, orderBy: { id: 'asc' } });
    await expect(service.reorderShortcuts(owner, { items: [{ id: foreign.id, version: foreign.version }] })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.reorderShortcuts(owner, { items: [{ id: own.id, version: own.version }, { id: own.id, version: own.version }] })).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.reorderShortcuts(owner, { items: [] })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.userShortcut.findMany({ where: { userId: { in: [owner.id, other.id] } }, orderBy: { id: 'asc' } })).toEqual(before);
  });
  test('parking positions work only within a transaction; failed commit and interrupted reorder roll back', async () => {
    const user = await account(); const row = await shortcut(user);
    await db.$transaction(async (tx) => {
      await tx.userShortcut.update({ where: { id: row.id }, data: { position: 8 } });
      await tx.userShortcut.update({ where: { id: row.id }, data: { position: 0 } });
    });
    // Prisma 5 may resolve despite PostgreSQL rejecting COMMIT. Verify the
    // actual persisted row, independent of that client's promise behavior.
    let commitError;
    await db.$transaction(async (tx) => {
      await tx.userShortcut.update({ where: { id: row.id }, data: { position: 8 } });
    }).catch((error) => { commitError = error; });
    const { isNamedCheck, expectNamedCheck } = require('../../../../testUtils/constraintFailure');
    if (commitError) expect(isNamedCheck(commitError, 'user_shortcuts_committed_position')).toBe(true);
    expect((await db.userShortcut.findUnique({ where: { id: row.id } })).position).toBe(0);
    await expectNamedCheck(db.$transaction(async (tx) => {
      await tx.userShortcut.update({ where: { id: row.id }, data: { position: 8 } });
      await tx.$executeRaw`SET CONSTRAINTS user_shortcuts_committed_position IMMEDIATE`;
    }), 'user_shortcuts_committed_position');
    expect((await db.userShortcut.findUnique({ where: { id: row.id } })).position).toBe(0);
    await expect(db.$transaction(async (tx) => {
      await tx.userShortcut.update({ where: { id: row.id }, data: { position: 9 } });
      throw new Error('Intentional fixture-only interruption');
    })).rejects.toThrow('Intentional fixture-only interruption');
    expect((await db.userShortcut.findUnique({ where: { id: row.id } })).position).toBe(0);
    expect(await db.userShortcut.count({ where: { userId: { in: userIds }, position: { gt: 7 } } })).toBe(0);
  });
  test('real deferred failure rejects service and route with safe 409 and restores every changed row', async () => {
    const user = await account(); await shortcut(user); await shortcut(user, 'SETTINGS');
    const rows = await db.userShortcut.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
    const items = rows.map(({ id, version }) => ({ id, version }));
    const originalTransaction = db.$transaction.bind(db);
    // Fixture-only fault injection at the final validation boundary: all real
    // locks, reorder writes, constraint evaluation and rollback still execute.
    const spy = jest.spyOn(db, '$transaction').mockImplementation((callback) => originalTransaction(async (tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === '$executeRaw') return async (...args) => {
          await tx.userShortcut.update({ where: { id: rows[0].id }, data: { position: 8, label: 'Must roll back' } });
          return tx.$executeRaw(...args);
        };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }))));
    try {
      await expect(service.reorderShortcuts(user, { items })).rejects.toMatchObject({ statusCode: 409, message: 'Shortcut order could not be saved. Refresh and try again.' });
      expect(await db.userShortcut.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } })).toEqual(rows);
      const route = require('../personal.routes').shortcuts.stack.find((layer) => layer.route?.path === '/reorder').route;
      const handler = route.stack[route.stack.length - 1].handle;
      const errorHandler = require('../../../middleware/errorHandler');
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      const request = { user, body: { items }, requestId: 'fixture-request' };
      await new Promise((resolve, reject) => {
        response.json = function json(body) { this.body = body; resolve(); return this; };
        handler(request, response, (error) => { try { errorHandler(error, request, response, () => {}); resolve(); } catch (e) { reject(e); } });
      });
      expect(response.statusCode).toBe(409);
      expect(response.body).toEqual({ success: false, message: 'Shortcut order could not be saved. Refresh and try again.', requestId: 'fixture-request' });
      expect(await db.userShortcut.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } })).toEqual(rows);
    } finally { spy.mockRestore(); }
    expect(await db.userShortcut.count({ where: { userId: user.id, position: { gt: 7 } } })).toBe(0);
    await service.reorderShortcuts(user, { items });
    expect((await service.listShortcuts(user)).shortcuts.map((row) => row.position)).toEqual([0, 1]);
  }, 15000);
});
