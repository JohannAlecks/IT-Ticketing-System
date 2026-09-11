const prisma = require('../../config/prisma');
const { z } = require('zod');
const AppError = require('../../utils/AppError');
const { buildTicketVisibilityFilter, assertTicketVisible } = require('../tickets/ticket.access');
const { writeNotifications, eventEntry } = require('../notifications/notification.service');
const empty = z.object({}).strict();
const roles = new Set(['USER', 'AGENT', 'ADMIN']);
async function watching(user, ticketId, action = 'read', input = {}) {
  if (!z.string().uuid().safeParse(ticketId).success || !empty.safeParse(input).success || !['read', 'watch', 'unwatch'].includes(action)) throw new AppError('Invalid watcher request', 422);
  if (!user?.id) throw new AppError('Authentication required', 401);
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock order is account then ticket; no timestamp/workload mutation.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR SHARE`;
      const account = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isActive: true, emailVerified: true } });
      if (!account?.isActive || !account.emailVerified || !roles.has(account.role)) throw new AppError('Authentication required', 401);
      if (action === 'read') await tx.$queryRaw`SELECT "id" FROM "tickets" WHERE "id" = ${ticketId} FOR SHARE`;
      else await tx.$queryRaw`SELECT "id" FROM "tickets" WHERE "id" = ${ticketId} FOR UPDATE`;
      const ticket = await tx.ticket.findFirst({ where: { AND: [{ id: ticketId }, buildTicketVisibilityFilter(account)] }, select: { id: true, archivedAt: true } });
      if (!ticket) throw new AppError('Ticket not found', 404);
      if (action === 'watch') {
        if (ticket.archivedAt) throw new AppError('Archived tickets cannot gain watchers', 409);
        await tx.ticketWatcher.upsert({ where: { ticketId_userId: { ticketId, userId: account.id } }, create: { ticketId, userId: account.id }, update: {} });
        return { isWatching: true };
      }
      if (action === 'unwatch') {
        await tx.ticketWatcher.deleteMany({ where: { ticketId, userId: account.id } });
        return { isWatching: false };
      }
      return { isWatching: Boolean(await tx.ticketWatcher.findUnique({ where: { ticketId_userId: { ticketId, userId: account.id } }, select: { id: true } })) };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (['P2002', 'P2034'].includes(error.code)) throw new AppError('Watching state changed. Refresh and try again.', 409);
    throw new AppError('Watching state is temporarily unavailable', 503);
  }
}

// Called inside the existing public-update transaction while its ticket write
// holds the same row lock as Watch/Unwatch: subscriptions affect future events.
async function notifyTicketWatchers(tx, { ticket, actorId, eventId, kind, domainEntries = [] }) {
  const domain = await writeNotifications(tx, { actorId, entries: domainEntries, returnRecipientIds: true });
  if (!ticket || ticket.archivedAt || !['PUBLIC_STAFF_REPLY', 'PUBLIC_REQUESTER_REPLY', 'STATUS_PRIORITY', 'ASSIGNMENT'].includes(kind)) return;
  const excluded = new Set([actorId, ...(domain.recipientIds || [])]);
  let cursor;
  while (true) {
    const rows = await tx.ticketWatcher.findMany({
      where: { ticketId: ticket.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, user: { select: { id: true, role: true, isActive: true, emailVerified: true } } },
      orderBy: { id: 'asc' }, take: 200,
    });
    if (!rows.length) break;
    const entries = rows.filter(({ user }) => {
      if (!user?.isActive || !user.emailVerified || !roles.has(user.role) || excluded.has(user.id)) return false;
      if (kind === 'PUBLIC_REQUESTER_REPLY' && user.role === 'USER') return false;
      try { assertTicketVisible(ticket, user); return true; } catch { return false; }
    }).map(({ user }) => ({ ...eventEntry({ recipientId: user.id, type: 'TICKET_WATCHED_UPDATE', ticketId: ticket.id,
      title: 'Watched ticket updated', message: 'An authorized ticket you follow has a new public update.', eventId: `${kind}:${eventId}` }),
      watcherStaffOnly: kind === 'PUBLIC_REQUESTER_REPLY' }));
    await writeNotifications(tx, { actorId, entries });
    if (rows.length < 200) break;
    cursor = rows.at(-1).id;
  }
}
module.exports = { watching, notifyTicketWatchers };
