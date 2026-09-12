// Explicit opt-in only AFTER separately approved deployment. Cleanup is limited
// to IDs generated here; this suite never migrates or touches existing tickets.
const { randomUUID } = require('crypto');
const { enabled, describeDb } = require('../../../../testUtils/databaseSuite');
const skipReason = 'requires the centralized dedicated test-database guard';
(enabled ? describe : describe.skip)('watchers local database and concurrency', () => {
  const db = require('../../../config/prisma');
  const { watching, notifyTicketWatchers } = require('../watcher.service');
  const tickets = require('../../tickets/ticket.service');
  const comments = require('../../comments/comment.service');
  const personal = require('../../personal/personal.service');
  const prefix = `watcher-it-${randomUUID()}`; const userIds = []; const ticketIds = [];
  let membershipBarrier = null;
  // Hold the real service's first write before commit; run the opposite
  // service call while the first transaction still holds the ticket lock.
  db.$use(async (params, next) => {
    if (membershipBarrier?.entered && params.model === 'User' && params.action === 'findUnique') membershipBarrier.secondStarted();
    const result = await next(params);
    if (membershipBarrier && !membershipBarrier.entered && params.model === 'TicketWatcher' && params.action === membershipBarrier.action) {
      membershipBarrier.entered = true;
      membershipBarrier.firstReady();
      await membershipBarrier.release;
    }
    return result;
  });
  async function account(role = 'USER') {
    const id = randomUUID(); userIds.push(id);
    return db.user.create({ data: { id, name: prefix, email: `${prefix}-${id}@example.test`, password: 'unused-test-fixture', role, emailVerified: true } });
  }
  async function ticket(owner, assignedToId = null) {
    const id = randomUUID(); ticketIds.push(id);
    return db.ticket.create({ data: { id, title: prefix, description: 'Watcher test fixture only', createdById: owner.id, assignedToId } });
  }
  const query = { page: 1, limit: 100, watchedByMe: true };
  beforeAll(async () => {
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20260912000000_add_ticket_watchers' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (applied.length !== 1) throw new Error('Watcher migration must be applied exactly once first');
  });
  afterAll(async () => {
    try {
      await db.notification.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { ticketId: { in: ticketIds } }] } });
      await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      expect(await db.ticketWatcher.count({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } }] } })).toBe(0);
      expect(await db.notification.count({ where: { recipientId: { in: userIds } } })).toBe(0);
      expect(await db.savedTicketView.count({ where: { userId: { in: userIds } } })).toBe(0);
      expect(await db.userShortcut.count({ where: { userId: { in: userIds } } })).toBe(0);
      expect(await db.user.count({ where: { id: { in: userIds } } })).toBe(0);
      expect(await db.ticket.count({ where: { id: { in: ticketIds } } })).toBe(0);
      console.log('Watcher fixture cleanup verified: users/tickets/watchers/notifications/views/shortcuts=0');
    } finally { await db.$disconnect(); }
  });
  test('simultaneous Watch is idempotent; sequential unwatch is stable and leaves no timeline or timestamp changes', async () => {
    const owner = await account(); const row = await ticket(owner);
    expect(await Promise.all([watching(owner, row.id, 'watch'), watching(owner, row.id, 'watch')])).toEqual([{ isWatching: true }, { isWatching: true }]);
    expect(await db.ticketWatcher.count({ where: { ticketId: row.id } })).toBe(1);
    expect(await db.ticketHistory.count({ where: { ticketId: row.id } })).toBe(0);
    expect((await db.ticket.findUnique({ where: { id: row.id } })).updatedAt).toEqual(row.updatedAt);
    await watching(owner, row.id, 'unwatch'); await watching(owner, row.id, 'unwatch');
    expect(await watching(owner, row.id)).toEqual({ isWatching: false });
  });
  test.each([['watch', 'unwatch', false], ['unwatch', 'watch', true]])('overlapping %s then %s service calls serialize to isWatching=%s', async (firstAction, secondAction, expected) => {
    const owner = await account(); const row = await ticket(owner);
    if (firstAction === 'unwatch') await watching(owner, row.id, 'watch');
    let firstReady, secondStarted, release;
    const ready = new Promise((resolve) => { firstReady = resolve; });
    const started = new Promise((resolve) => { secondStarted = resolve; });
    membershipBarrier = { action: firstAction === 'watch' ? 'upsert' : 'deleteMany', firstReady, secondStarted, entered: false,
      release: new Promise((resolve) => { release = resolve; }) };
    try {
      const first = watching(owner, row.id, firstAction);
      await ready;
      let settled = false;
      const second = watching(owner, row.id, secondAction).finally(() => { settled = true; });
      await started; expect(settled).toBe(false); release();
      expect(await first).toEqual({ isWatching: firstAction === 'watch' });
      expect(await second).toEqual({ isWatching: expected });
      membershipBarrier = null;
      expect(await watching(owner, row.id)).toEqual({ isWatching: expected });
      expect(await db.ticketWatcher.count({ where: { ticketId: row.id, userId: owner.id } })).toBe(expected ? 1 : 0);
    } finally { release(); membershipBarrier = null; }
  });
  test('ownership/assignment intersect watched views; retained joins do not grant access', async () => {
    const owner = await account(); const other = await account(); const agent = await account('AGENT'); const foreign = await account('AGENT'); const admin = await account('ADMIN');
    const row = await ticket(owner); await watching(owner, row.id, 'watch'); await watching(agent, row.id, 'watch'); await watching(admin, row.id, 'watch');
    await expect(watching(other, row.id, 'watch')).rejects.toMatchObject({ statusCode: 404 });
    expect((await tickets.listTickets(agent, query)).tickets.map((t) => t.id)).toContain(row.id);
    const saved = await personal.createView(agent, { name: 'Watched', scope: 'ALL_AUTHORIZED', filters: { watchedByMe: true } });
    expect((await personal.executeView(agent, saved.id, {})).tickets.map((t) => t.id)).toContain(row.id);
    await db.ticket.update({ where: { id: row.id }, data: { assignedToId: foreign.id } });
    expect((await personal.executeView(agent, saved.id, {})).tickets).toEqual([]);
    await expect(watching(agent, row.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.ticketWatcher.count({ where: { ticketId: row.id, userId: agent.id } })).toBe(1);
    expect((await tickets.listTickets(admin, query)).tickets.map((t) => t.id)).toContain(row.id);
  });
  test('archive preserves joins, requires explicit list scope, and allows only authorized Unwatch', async () => {
    const owner = await account(); const admin = await account('ADMIN'); const row = await ticket(owner);
    await watching(owner, row.id, 'watch'); await db.ticket.update({ where: { id: row.id }, data: { archivedAt: new Date(), status: 'CLOSED' } });
    expect((await tickets.listTickets(owner, query)).tickets).toEqual([]);
    expect((await tickets.listTickets(owner, { ...query, archive: 'archived' })).tickets.map((t) => t.id)).toEqual([row.id]);
    await expect(watching(admin, row.id, 'watch')).rejects.toMatchObject({ statusCode: 409 });
    await watching(owner, row.id, 'unwatch'); expect(await watching(owner, row.id)).toEqual({ isWatching: false });
    await db.ticket.update({ where: { id: row.id }, data: { archivedAt: null } }); expect(await watching(owner, row.id)).toEqual({ isWatching: false });
  });
  test('public replies are generic, deduped from domain alerts, private notes are silent, and opt-outs affect only future events', async () => {
    const owner = await account(); const agent = await account('AGENT'); const admin = await account('ADMIN'); const row = await ticket(owner, agent.id);
    for (const user of [owner, agent, admin]) await watching(user, row.id, 'watch');
    await comments.addComment(row.id, { content: 'private fixture internal note', isInternal: true }, agent);
    expect(await db.notification.count({ where: { ticketId: row.id } })).toBe(0);
    const reply = await comments.addComment(row.id, { content: 'public fixture body not for notification', isInternal: false }, agent);
    let notices = await db.notification.findMany({ where: { ticketId: row.id } });
    expect(notices).toHaveLength(2); expect(notices.filter((n) => n.recipientId === owner.id)).toHaveLength(1);
    expect(notices.find((n) => n.recipientId === admin.id).type).toBe('TICKET_WATCHED_UPDATE');
    expect(notices.every((n) => !n.message.includes('fixture'))).toBe(true);
    await db.$transaction((tx) => notifyTicketWatchers(tx, { ticket: row, actorId: agent.id, eventId: reply.id, kind: 'PUBLIC_STAFF_REPLY', domainEntries: [{ recipientId: owner.id, type: 'TICKET_PUBLIC_REPLY', ticketId: row.id, title: 'Reply', message: 'Safe', dedupeKey: `n:TICKET_PUBLIC_REPLY:${reply.id}:${owner.id}` }] }));
    expect(await db.notification.count({ where: { ticketId: row.id } })).toBe(2);
    await db.notificationPreference.create({ data: { userId: admin.id, ticketWatchedUpdates: false } });
    await comments.addComment(row.id, { content: 'next public update', isInternal: false }, owner);
    expect(await db.notification.count({ where: { ticketId: row.id, recipientId: admin.id } })).toBe(1);
    expect(await db.notification.count({ where: { ticketId: row.id, recipientId: agent.id } })).toBe(1);
  });
  test('deactivation preserves membership; reactivation checks current role and assignment before delivery', async () => {
    const owner = await account(); const admin = await account('ADMIN'); const foreign = await account('AGENT'); const row = await ticket(owner, foreign.id);
    await watching(admin, row.id, 'watch'); await db.user.update({ where: { id: admin.id }, data: { isActive: false } });
    await expect(watching(admin, row.id, 'unwatch')).rejects.toMatchObject({ statusCode: 401 });
    const notify = () => db.$transaction((tx) => notifyTicketWatchers(tx, { ticket: row, actorId: owner.id, eventId: randomUUID(), kind: 'STATUS_PRIORITY' }));
    await notify(); expect(await db.notification.count({ where: { ticketId: row.id } })).toBe(0);
    await db.user.update({ where: { id: admin.id }, data: { isActive: true, role: 'AGENT' } }); await notify();
    expect(await db.notification.count({ where: { ticketId: row.id } })).toBe(0);
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } }); await notify();
    expect(await db.notification.count({ where: { ticketId: row.id } })).toBe(1);
    expect(await db.ticketWatcher.count({ where: { ticketId: row.id } })).toBe(1);
  });
  test('unique pair, lookup indexes and join-only cascades match the database design', async () => {
    const owner = await account(); const watcher = await account('ADMIN'); const row = await ticket(owner);
    await watching(watcher, row.id, 'watch');
    await expect(db.ticketWatcher.create({ data: { ticketId: row.id, userId: watcher.id } })).rejects.toMatchObject({ code: 'P2002' });
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ticket_watchers'`;
    expect(indexes.map((i) => i.indexname).sort()).toEqual(['ticket_watchers_pkey', 'ticket_watchers_ticketId_userId_key', 'ticket_watchers_userId_createdAt_idx'].sort());
    const fks = await db.$queryRaw`SELECT conname, confdeltype, confupdtype FROM pg_constraint WHERE conrelid = 'public.ticket_watchers'::regclass AND contype = 'f'`;
    expect(fks).toHaveLength(2); expect(fks.every((fk) => fk.confdeltype === 'c' && fk.confupdtype === 'c')).toBe(true);
    await db.user.delete({ where: { id: watcher.id } }); expect(await db.ticketWatcher.count({ where: { ticketId: row.id } })).toBe(0);
    expect(await db.ticket.count({ where: { id: row.id } })).toBe(1);
    await watching(owner, row.id, 'watch'); await db.ticket.delete({ where: { id: row.id } }); expect(await db.ticketWatcher.count({ where: { ticketId: row.id } })).toBe(0);
  });
});
