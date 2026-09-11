const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { PREFERENCE_FIELDS } = require('./notification.schema');
const { assertTicketVisible } = require('../tickets/ticket.access');

const MANDATORY_PREFERENCE_FIELDS = ['accountReactivated'];
const ROLE_VISIBLE_PREFERENCE_FIELDS = {
  USER: ['ticketStatusChanged', 'ticketPublicReply', 'ticketWatchedUpdates'],
  AGENT: ['ticketAssigned', 'ticketUnassigned', 'ticketStatusChanged', 'ticketPublicReply', 'knowledgePublished', 'knowledgeReturned', 'slaDueSoon', 'ticketWatchedUpdates'],
  ADMIN: PREFERENCE_FIELDS,
};
const TYPE_PREFERENCE_FIELD = {
  TICKET_WATCHED_UPDATE: 'ticketWatchedUpdates',
  TICKET_ASSIGNED: 'ticketAssigned',
  TICKET_UNASSIGNED: 'ticketUnassigned',
  TICKET_STATUS_CHANGED: 'ticketStatusChanged',
  TICKET_PUBLIC_REPLY: 'ticketPublicReply',
  TICKET_WORK_BLOCKING: 'ticketWorkBlocking',
  KNOWLEDGE_SUBMITTED: 'knowledgeSubmitted',
  KNOWLEDGE_PUBLISHED: 'knowledgePublished',
  KNOWLEDGE_RETURNED: 'knowledgeReturned',
  SLA_FIRST_RESPONSE_DUE_SOON: 'slaDueSoon',
  SLA_RESOLUTION_DUE_SOON: 'slaDueSoon',
};
const PREFERENCE_SELECT = Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, true]));

const NOTIFICATION_SELECT = {
  id: true, type: true, ticketId: true, articleId: true,
  title: true, message: true, readAt: true, createdAt: true,
};

// This is intentionally the only writer. Callers pass server-selected IDs and
// hardcoded copy; the client never supplies recipient IDs or notification text.
async function writeNotifications(tx, { actorId = null, entries, returnRecipientIds = false }) {
  const unique = new Map();
  for (const entry of entries || []) {
    if (!entry || !entry.recipientId || entry.recipientId === actorId) continue;
    // A recipient can receive distinct SLA milestones in one sweep. Dedupe is
    // the stable event key, not recipient identity alone.
    unique.set(`${entry.recipientId}:${entry.dedupeKey || `${entry.type}:${entry.ticketId || ''}`}`, entry);
  }
  const candidates = [...unique.values()];
  const watcherTicketIds = [...new Set(candidates.filter((entry) => entry.type === 'TICKET_WATCHED_UPDATE').map((entry) => entry.ticketId))];
  if (!candidates.length) return { count: 0 };

  const activeUsers = await tx.user.findMany({
    where: { id: { in: candidates.map((entry) => entry.recipientId) }, isActive: true },
    select: { id: true, role: true, ...(watcherTicketIds.length ? { emailVerified: true } : {}) },
  });
  const activeUsersById = new Map(activeUsers.map((user) => [user.id, user]));
  const activeIds = new Set(activeUsersById.keys());
  if (!activeIds.size) return { count: 0 };

  // One batch read avoids an N+1 preference lookup and preserves the existing
  // server-selected recipient and active-account policies.
  const preferences = await tx.notificationPreference.findMany({
    where: { userId: { in: [...activeIds] } },
    select: { userId: true, ...PREFERENCE_SELECT },
  });
  const preferencesByUserId = new Map(preferences.map((preference) => [preference.userId, preference]));
  // Recheck access at the only writer against the latest batched roles.
  const watcherTickets = watcherTicketIds.length ? await tx.ticket.findMany({ where: { id: { in: watcherTicketIds }, archivedAt: null }, select: { id: true, createdById: true, assignedToId: true } }) : [];
  const ticketsById = new Map(watcherTickets.map((ticket) => [ticket.id, ticket]));
  const data = candidates.filter((entry) => {
    const recipient = activeUsersById.get(entry.recipientId);
    if (!recipient) return false;
    if (entry.type === 'TICKET_WATCHED_UPDATE') {
      const ticket = ticketsById.get(entry.ticketId);
      if (!ticket || !recipient.emailVerified || !['USER', 'AGENT', 'ADMIN'].includes(recipient.role)) return false;
      if (entry.watcherStaffOnly && recipient.role === 'USER') return false;
      try { assertTicketVisible(ticket, recipient); } catch { return false; }
    }
    if (entry.type === 'TICKET_SATISFACTION_RECEIVED' && recipient.role !== 'AGENT') return false;
    if (entry.type.startsWith('SLA_') && !['AGENT', 'ADMIN'].includes(recipient.role)) return false;
    const preferenceField = TYPE_PREFERENCE_FIELD[entry.type];
    return !preferenceField || preferencesByUserId.get(entry.recipientId)?.[preferenceField] !== false;
  }).map((entry) => ({
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
  const result = await tx.notification.createMany({ data, skipDuplicates: true });
  // Opt-in evidence suppresses only domain alerts surviving preference checks.
  return returnRecipientIds ? { ...result, recipientIds: [...new Set(data.map((row) => row.recipientId))] } : result;
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

function visiblePreferenceFields(role) {
  return ROLE_VISIBLE_PREFERENCE_FIELDS[role] || [];
}

function defaultPreferences(user) {
  return Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, field === 'slaDueSoon' ? ['AGENT', 'ADMIN'].includes(user?.role) : true]));
}

function preferenceResponse(user, preference) {
  const values = { ...defaultPreferences(user), ...(preference || {}) };
  return {
    preferences: {
      ...Object.fromEntries(visiblePreferenceFields(user.role).map((field) => [field, values[field]])),
      accountReactivated: true,
      ...(['AGENT', 'ADMIN'].includes(user.role) ? { slaBreached: true } : {}),
    },
    mandatory: [...MANDATORY_PREFERENCE_FIELDS, ...(['AGENT', 'ADMIN'].includes(user.role) ? ['slaBreached'] : [])],
  };
}

async function getNotificationPreferences(user) {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: user.id },
    select: PREFERENCE_SELECT,
  });
  return preferenceResponse(user, preference);
}

async function updateNotificationPreferences(user, changes, requestId) {
  const visibleFields = new Set(visiblePreferenceFields(user.role));
  const irrelevantKeys = Object.keys(changes).filter((field) => !visibleFields.has(field));
  if (irrelevantKeys.length) throw new AppError('One or more notification preferences are not available for your role', 422);

  return prisma.$transaction(async (tx) => {
    const current = await tx.notificationPreference.findUnique({
      where: { userId: user.id },
      select: PREFERENCE_SELECT,
    });
    const effectiveCurrent = { ...defaultPreferences(user), ...(current || {}) };
    const changedKeys = Object.keys(changes).filter((field) => effectiveCurrent[field] !== changes[field]);
    if (!changedKeys.length) return preferenceResponse(user, current);

    const preference = await tx.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...changes },
      update: changes,
      select: PREFERENCE_SELECT,
    });
    await tx.auditEvent.create({
      data: {
        eventType: 'notification.preferences_updated',
        entityType: 'notification_preferences',
        entityId: user.id,
        actorUserId: user.id,
        requestId,
        metadata: { changedKeys },
      },
    });
    return preferenceResponse(user, preference);
  });
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

module.exports = {
  NOTIFICATION_SELECT, PREFERENCE_FIELDS, PREFERENCE_SELECT, MANDATORY_PREFERENCE_FIELDS,
  TYPE_PREFERENCE_FIELD, visiblePreferenceFields, preferenceResponse, writeNotifications,
  ticketReference, statusLabel, eventEntry, getNotificationPreferences, updateNotificationPreferences,
  listNotifications, unreadCount, readAll, setReadState,
};
