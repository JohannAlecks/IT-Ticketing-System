const prisma = require('../../config/prisma');
const { ACTIVE_STATUSES, milestone } = require('./sla.engine');
const { writeNotifications, eventEntry, ticketReference } = require('../notifications/notification.service');

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;
const MAX_BATCH_SIZE = 100;
const MAX_BATCHES = 20;

function activeCandidateWhere(afterId = null) {
  return {
    archivedAt: null,
    status: { in: ACTIVE_STATUSES },
    slaPolicyId: { not: null },
    OR: [{ firstRespondedAt: null }, { resolutionCompletedAt: null }],
    ...(afterId ? { id: { gt: afterId } } : {}),
  };
}

function escalationEntries(ticket, milestones, recipientIds) {
  const entries = [];
  const cycle = ticket.resolutionCycleStartedAt ? new Date(ticket.resolutionCycleStartedAt).toISOString() : 'initial';
  for (const { kind, item, isNewBreach } of milestones) {
    if (!item || !['DUE_SOON', 'BREACHED'].includes(item.state)) continue;
    const breached = item.state === 'BREACHED';
    const type = kind === 'firstResponse'
      ? (breached ? 'SLA_FIRST_RESPONSE_BREACHED' : 'SLA_FIRST_RESPONSE_DUE_SOON')
      : (breached ? 'SLA_RESOLUTION_BREACHED' : 'SLA_RESOLUTION_DUE_SOON');
    const eventId = `${ticket.id}:${kind}:${kind === 'resolution' ? cycle : 'initial'}:${breached ? 'breach' : 'due-soon'}`;
    for (const recipientId of recipientIds({ breached, isNewBreach })) entries.push(eventEntry({
      recipientId, type, ticketId: ticket.id,
      title: breached ? 'Ticket SLA breached' : 'Ticket SLA due soon',
      message: `${kind === 'firstResponse' ? 'First response' : 'Resolution'} SLA for ticket ${ticketReference(ticket.id)} is ${breached ? 'breached' : 'due soon'}.`,
      eventId,
    }));
  }
  return entries;
}

async function markBreach(tx, ticket, kind, now) {
  const response = kind === 'firstResponse';
  const result = await tx.ticket.updateMany({
    where: {
      id: ticket.id, archivedAt: null, status: ticket.status, slaVersion: ticket.slaVersion,
      ...(response
        ? { firstRespondedAt: null, firstResponseBreachedAt: null }
        : { resolutionCompletedAt: null, resolutionPausedAt: null, resolutionBreachedAt: null }),
    },
    data: { ...(response ? { firstResponseBreachedAt: now } : { resolutionBreachedAt: now }), updatedAt: ticket.updatedAt, slaVersion: { increment: 1 } },
  });
  if (!result.count) return false;
  await Promise.all([
    tx.auditEvent.create({ data: { eventType: 'sla.milestone_breached', entityType: 'ticket', entityId: ticket.id, actorUserId: null, metadata: { milestone: kind, at: now.toISOString(), automated: true } } }),
    tx.ticketHistory.create({ data: { ticketId: ticket.id, userId: null, action: 'UPDATED', description: `SLA ${kind === 'firstResponse' ? 'first response' : 'resolution'} breached`, metadata: { visibility: 'internal', slaEvent: 'milestone_breached', milestone: kind, automated: true } } }),
  ]);
  return true;
}

async function evaluateTicket(id, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    // Serialize sweeps with all ticket mutations without changing healthy
    // tickets' activity timestamps. Re-read only after acquiring the row lock.
    await tx.$queryRaw`SELECT "id" FROM "tickets" WHERE "id" = ${id} FOR UPDATE`;
    const ticket = await tx.ticket.findUnique({ where: { id } });
    if (!ticket || ticket.archivedAt || !ACTIVE_STATUSES.includes(ticket.status) || !ticket.slaPolicyId) return { skipped: true, notifications: 0, breaches: 0 };
    const response = milestone(ticket, 'firstResponse', now);
    const resolution = milestone(ticket, 'resolution', now);
    // Conditional writes additionally protect each milestone's once-only record.
    const responseBreach = response?.state === 'BREACHED' && !ticket.firstResponseBreachedAt ? await markBreach(tx, ticket, 'firstResponse', now) : false;
    const afterResponse = responseBreach ? await tx.ticket.findUnique({ where: { id } }) : ticket;
    const resolutionBreach = resolution?.state === 'BREACHED' && !afterResponse?.resolutionBreachedAt ? await markBreach(tx, afterResponse, 'resolution', now) : false;
    const current = resolutionBreach ? await tx.ticket.findUnique({ where: { id } }) : afterResponse;
    if (!current || current.archivedAt || !ACTIVE_STATUSES.includes(current.status)) return { skipped: true, notifications: 0, breaches: 0 };
    const currentResponse = milestone(current, 'firstResponse', now);
    const currentResolution = milestone(current, 'resolution', now);
    const adminIds = (current.priority === 'URGENT' || current.isWorkBlocking) && [currentResponse, currentResolution].some((item) => item?.state === 'BREACHED')
      ? (await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((admin) => admin.id)
      : [];
    const recipients = ({ breached }) => breached
      ? [...new Set([current.assignedToId, ...adminIds].filter(Boolean))]
      : (current.assignedToId ? [current.assignedToId] : []);
    const notifications = await writeNotifications(tx, {
      actorId: null,
      entries: escalationEntries(current, [
        { kind: 'firstResponse', item: currentResponse, isNewBreach: responseBreach },
        { kind: 'resolution', item: currentResolution, isNewBreach: resolutionBreach },
      ], recipients),
    });
    return { skipped: false, notifications: notifications.count || 0, breaches: Number(responseBreach) + Number(resolutionBreach) };
  });
}

function bounded(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : fallback;
}

async function runSweep({ batchSize = DEFAULT_BATCH_SIZE, maxBatches = DEFAULT_MAX_BATCHES, afterId = null, now = new Date() } = {}) {
  const size = bounded(batchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const budget = bounded(maxBatches, DEFAULT_MAX_BATCHES, MAX_BATCHES);
  if (afterId !== null && (typeof afterId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(afterId))) {
    const error = new Error('Invalid sweep cursor');
    error.code = 'INVALID_ARGUMENT';
    throw error;
  }
  const results = [];
  let scanned = 0;
  for (let batch = 0; batch < budget; batch += 1) {
    const candidates = await prisma.ticket.findMany({ where: activeCandidateWhere(afterId), select: { id: true }, orderBy: { id: 'asc' }, take: size });
    if (!candidates.length) break;
    scanned += candidates.length;
    afterId = candidates[candidates.length - 1].id;
    for (const candidate of candidates) results.push(await evaluateTicket(candidate.id, now));
    if (candidates.length < size) break;
  }
  const reachedLimit = scanned === size * budget;
  return { scanned, processed: results.filter((result) => !result.skipped).length, skipped: results.filter((result) => result.skipped).length, breaches: results.reduce((sum, result) => sum + result.breaches, 0), notifications: results.reduce((sum, result) => sum + result.notifications, 0), bounded: reachedLimit, nextCursor: reachedLimit ? afterId : null };
}

module.exports = { DEFAULT_BATCH_SIZE, DEFAULT_MAX_BATCHES, MAX_BATCH_SIZE, MAX_BATCHES, activeCandidateWhere, escalationEntries, markBreach, evaluateTicket, runSweep };
