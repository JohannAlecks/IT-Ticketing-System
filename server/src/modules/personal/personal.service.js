const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const schema = require('./personal.schema');
const { ROUTES, SCOPES, assertViewAllowed, routeFor, viewPath, unavailable } = require('./personal.policy');
const conflict = () => new AppError('Preference changed, duplicate target/name, or limit reached. Refresh and try again.', 409);
const parse = (validator, body) => {
  const result = validator.safeParse(body);
  if (!result.success) throw new AppError('Invalid personal preference fields', 422);
  return result.data;
};
const normalizeName = (name) => name.normalize('NFKC').toLowerCase();

// All mutations for one account share this lock, including limit checks,
// deletions and reorder. It also serializes against account role/deactivation.
async function withAccount(user, callback, write = false) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (write) await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR SHARE`;
      const current = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isActive: true, emailVerified: true } });
      if (!current?.isActive || !current.emailVerified || !SCOPES[current.role]) throw new AppError('Authentication required', 401);
      const result = await callback(tx, current);
      // Surface deferred violations before COMMIT: Prisma 5 can swallow an
      // error raised by PostgreSQL during the commit protocol itself.
      if (write) {
        try {
          await tx.$executeRaw`SET CONSTRAINTS public.user_shortcuts_committed_position IMMEDIATE`;
        } catch (error) {
          // PostgreSQL check_violation from the explicit deferred check. Never
          // forward the raw Prisma query, constraint name or database message.
          if (error.code === 'P2010' && error.meta?.code === '23514') {
            throw new AppError('Shortcut order could not be saved. Refresh and try again.', 409);
          }
          throw error;
        }
      }
      return result;
    });
  } catch (error) {
    if (['P2002', 'P2034'].includes(error.code)) throw conflict();
    throw error;
  }
}
function validateStored(view, user) {
  const result = schema.filtersSchema.safeParse(view.filters);
  if (!result.success) throw unavailable();
  assertViewAllowed(user, view.scope, result.data);
  return result.data;
}
function exposeView(view, user) {
  try {
    const filters = validateStored(view, user);
    return { id: view.id, name: view.name, scope: view.scope, filters, version: view.version, available: true, path: viewPath(view) };
  } catch {
    return { id: view.id, name: view.name, version: view.version, available: false, reason: 'Unavailable for your current permissions or filter format.' };
  }
}
async function ownView(tx, user, id) {
  const view = await tx.savedTicketView.findFirst({ where: { id, userId: user.id } });
  if (!view) throw unavailable();
  return view;
}
async function listViews(user) {
  return withAccount(user, async (tx, account) => ({
    views: (await tx.savedTicketView.findMany({ where: { userId: account.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 20 })).map((v) => exposeView(v, account)),
    scopes: SCOPES[account.role], limit: 20,
  }));
}
async function createView(user, input) {
  const body = parse(schema.createViewSchema, input);
  return withAccount(user, async (tx, account) => {
    assertViewAllowed(account, body.scope, body.filters);
    if (await tx.savedTicketView.count({ where: { userId: account.id } }) >= 20) throw conflict();
    const view = await tx.savedTicketView.create({ data: { ...body, normalizedName: normalizeName(body.name), userId: account.id } });
    return exposeView(view, account);
  }, true);
}
async function updateView(user, id, input) {
  const { version, ...body } = parse(schema.updateViewSchema, input);
  return withAccount(user, async (tx, account) => {
    const view = await ownView(tx, account, id);
    if (view.version !== version) throw conflict();
    const merged = { ...view, ...body };
    validateStored(merged, account);
    const updated = await tx.savedTicketView.update({ where: { id }, data: { ...body, ...(body.name ? { normalizedName: normalizeName(body.name) } : {}), version: { increment: 1 } } });
    return exposeView(updated, account);
  }, true);
}
async function reorderRows(tx, rows) {
  // Vacate final positions first to preserve the non-deferrable unique index.
  for (let i = 0; i < rows.length; i++) await tx.userShortcut.update({ where: { id: rows[i].id }, data: { position: i + 8 } });
  for (let i = 0; i < rows.length; i++) await tx.userShortcut.update({ where: { id: rows[i].id }, data: { position: i, version: { increment: 1 } } });
}
async function deleteView(user, id, input) {
  const { version } = parse(schema.deleteSchema, input);
  return withAccount(user, async (tx, account) => {
    const view = await ownView(tx, account, id);
    if (view.version !== version) throw conflict();
    await tx.savedTicketView.delete({ where: { id } }); // cascades only its shortcuts
    await reorderRows(tx, await tx.userShortcut.findMany({ where: { userId: account.id }, orderBy: { position: 'asc' } }));
  }, true);
}
async function executeView(user, id, input) {
  const pagination = parse(schema.executeSchema, input);
  return withAccount(user, async (tx, account) => {
    const view = await ownView(tx, account, id);
    const filters = validateStored(view, account);
    const query = { ...filters, ...pagination, archive: view.scope === 'ARCHIVED' ? 'archived' : 'active',
      ...(view.scope === 'ASSIGNED_TO_ME' ? { assignedToId: account.id } : {}) };
    // Reuse the normal role visibility, archive boundary, SLA and projections.
    const result = await require('../tickets/ticket.service').listTickets(account, query, tx);
    return { ...result, view: exposeView(view, account) };
  });
}
function exposeShortcut(row, user) {
  let path = null;
  if (row.targetType === 'ROUTE') path = routeFor(user, row.routeKey)?.path || null;
  if (row.targetType === 'SAVED_VIEW' && row.savedView?.userId === user.id) {
    try { validateStored(row.savedView, user); path = viewPath(row.savedView); } catch { /* unavailable, removable by owner */ }
  }
  return { id: row.id, label: row.label, targetType: row.targetType, position: row.position, version: row.version,
    available: Boolean(path), ...(path ? { path, routeKey: row.routeKey, savedViewId: row.savedViewId } : { reason: 'Unavailable for your current permissions or filter format.' }) };
}
async function shortcutRows(tx, user) {
  return tx.userShortcut.findMany({ where: { userId: user.id }, include: { savedView: true }, orderBy: { position: 'asc' }, take: 8 });
}
async function listShortcuts(user) {
  return withAccount(user, async (tx, account) => ({
    shortcuts: (await shortcutRows(tx, account)).map((r) => exposeShortcut(r, account)), limit: 8,
    routes: Object.entries(ROUTES).filter(([key]) => routeFor(account, key)).map(([key, route]) => ({ key, label: key === 'REPORTS' && account.role === 'AGENT' ? 'My Reports' : route.label, path: route.path })),
  }));
}
async function createShortcut(user, input) {
  const body = parse(schema.createShortcutSchema, input);
  return withAccount(user, async (tx, account) => {
    if (body.targetType === 'ROUTE' && !routeFor(account, body.routeKey)) throw unavailable();
    if (body.targetType === 'SAVED_VIEW') validateStored(await ownView(tx, account, body.savedViewId), account);
    const rows = await shortcutRows(tx, account);
    if (rows.length >= 8) throw conflict();
    const targetKey = body.targetType === 'ROUTE' ? `route:${body.routeKey}` : `view:${body.savedViewId}`;
    if (rows.some((r) => r.targetKey === targetKey)) throw conflict();
    const row = await tx.userShortcut.create({ data: { ...body, userId: account.id, targetKey, position: rows.length }, include: { savedView: true } });
    return exposeShortcut(row, account);
  }, true);
}
async function updateShortcut(user, id, input, remove = false) {
  const body = parse(remove ? schema.deleteSchema : schema.updateShortcutSchema, input);
  return withAccount(user, async (tx, account) => {
    const rows = await shortcutRows(tx, account);
    const row = rows.find((r) => r.id === id);
    if (!row) throw unavailable();
    if (body.version !== row.version) throw conflict();
    if (remove) {
      await tx.userShortcut.delete({ where: { id } });
      await reorderRows(tx, rows.filter((r) => r.id !== id));
      return;
    }
    return exposeShortcut(await tx.userShortcut.update({ where: { id }, data: { label: body.label, version: { increment: 1 } }, include: { savedView: true } }), account);
  }, true);
}
async function reorderShortcuts(user, input) {
  const { items } = parse(schema.reorderSchema, input);
  return withAccount(user, async (tx, account) => {
    const rows = await shortcutRows(tx, account);
    if (items.length !== rows.length || items.some((item) => !rows.some((r) => r.id === item.id && r.version === item.version))) throw conflict();
    await reorderRows(tx, items);
    return { shortcuts: (await shortcutRows(tx, account)).map((r) => exposeShortcut(r, account)) };
  }, true);
}
module.exports = { listViews, createView, updateView, deleteView, executeView, listShortcuts, createShortcut, updateShortcut, reorderShortcuts, normalizeName, validateStored };
