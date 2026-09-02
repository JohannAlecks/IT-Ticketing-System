const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

const NOTIFICATION_SELECT = {
  id: true, type: true, ticketId: true, articleId: true,
  title: true, message: true, readAt: true, createdAt: true,
};

// This is intentionally the only writer. Callers pass server-selected IDs and
// hardcoded copy; the client never supplies recipient IDs or notification text.
async function writeNotifications(tx, { actorId = null, entries }) {
  const unique = new Map();
  for (const entry of entries || []) {
    if (!entry || !entry.recipientId || entry.recipientId === actorId) continue;
    unique.set(entry.recipientId, entry);
  }
  const candidates = [...unique.values()];
  if (!candidates.length) return { count: 0 };

  const activeUsers = await tx.user.findMany({
    where: { id: { in: candidates.map((entry) => entry.recipientId) }, isActive: true },
    select: { id: true },
  });
  const activeIds = new Set(activeUsers.map((user) => user.id));
  const data = candidates.filter((entry) => activeIds.has(entry.recipientId)).map((entry) => ({
    recipientId: entry.recipientId,
    actorId,
    type: entry.type,
    ticketId: entry.ticketId || null,
    articleId: entry.articleId || null,
    title: entry.title,
    message: entry.message,
    dedupeKey: entry.dedupeKey || null,
  }));
  if (!data.length) return { count: 0 };
  return tx.notification.createMany({ data, skipDuplicates: true });
}

function ticketReference(ticketId) {
  return `#${String(ticketId).replace(/-/g, '').slice(0, 8)}`;
}

function statusLabel(status) {
  return ({ OPEN: 'Open', IN_PROGRESS: 'In progress', PENDING: 'Pending', RESOLVED: 'Resolved', CLOSED: 'Closed' })[status] || 'Updated';
}

function eventEntry({ recipientId, type, ticketId = null, articleId = null, title, message, eventId }) {
  return { recipientId, type, ticketId, articleId, title, message, dedupeKey: `n:${type}:${eventId}:${recipientId}` };
}

async function listNotifications(user, query) {
  const where = { recipientId: user.id, ...(query.status === 'UNREAD' ? { readAt: null } : {}), ...(query.type ? { type: query.type } : {}) };
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, select: NOTIFICATION_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.notification.count({ where }),
  ]);
  return { notifications, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}

async function unreadCount(user) {
  return prisma.notification.count({ where: { recipientId: user.id, readAt: null } });
}

async function readAll(user) {
  return prisma.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
}

async function setReadState(user, id, read) {
  const result = await prisma.notification.updateMany({ where: { id, recipientId: user.id }, data: { readAt: read ? new Date() : null } });
  if (!result.count) throw new AppError('Notification not found', 404);
  return prisma.notification.findFirst({ where: { id, recipientId: user.id }, select: NOTIFICATION_SELECT });
}

module.exports = { NOTIFICATION_SELECT, writeNotifications, ticketReference, statusLabel, eventEntry, listNotifications, unreadCount, readAll, setReadState };
