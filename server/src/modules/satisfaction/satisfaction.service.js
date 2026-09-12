const prisma = require('../../config/prisma');
const { departmentSelect, departmentName } = require('../departments/department.projection');
const AppError = require('../../utils/AppError');
const { feedbackSchema } = require('./satisfaction.schema');
const { writeNotifications, eventEntry } = require('../notifications/notification.service');
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const terminal = (status) => ['RESOLVED', 'CLOSED'].includes(status);
const feedbackSelect = { id: true, rating: true, comment: true, version: true, submittedAt: true, updatedAt: true };
const cycleSelect = { id: true, number: true, ticketId: true, requesterId: true, assignedAgentId: true, departmentSnapshot: true, resolvedAt: true, satisfaction: { select: feedbackSelect } };
const token = (cycle) => `"csat:${cycle.id}:${cycle.satisfaction?.version || 0}"`;
const deadline = (cycle) => new Date(new Date(cycle.resolvedAt).getTime() + WINDOW_MS);
const conflict = () => new AppError('Feedback or resolution cycle changed. Reload feedback before trying again.', 409);

// Only after a successful conditional RESOLVED transition, in its transaction.
async function recordResolution(tx, ticket, actor, resolvedAt) {
  const requester = await tx.user.findUnique({ where: { id: ticket.createdById }, select: departmentSelect });
  const assigned = actor.role === 'AGENT' && ticket.assignedToId
    ? await tx.user.findUnique({ where: { id: ticket.assignedToId }, select: { role: true } }) : null;
  return tx.ticketResolutionCycle.create({ data: {
    ticketId: ticket.id, number: (ticket.satisfactionCycleNumber || 0) + 1,
    requesterId: ticket.createdById, assignedAgentId: assigned?.role === 'AGENT' ? ticket.assignedToId : null,
    departmentSnapshot: departmentName(requester)?.trim().slice(0, 100) || null, resolvedAt,
  } });
}

function presentCycle(cycle, ticket, user, now = new Date()) {
  const current = cycle.number === ticket.satisfactionCycleNumber;
  const expiresAt = deadline(cycle);
  const canWrite = current && terminal(ticket.status) && user.role === 'USER' && user.id === cycle.requesterId && user.isActive !== false && now < expiresAt;
  return { id: cycle.id, number: cycle.number, resolvedAt: cycle.resolvedAt, expiresAt,
    feedback: cycle.satisfaction, current, canWrite,
    state: !current || !terminal(ticket.status) ? 'HISTORICAL' : now >= expiresAt ? 'EXPIRED' : cycle.satisfaction ? 'SUBMITTED' : 'OPEN',
    ...(canWrite ? { editToken: token(cycle) } : {}),
  };
}

async function getTicketSatisfaction(id, user, { page = 1, limit = 10 } = {}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id }, select: { id: true, createdById: true, status: true, satisfactionCycleNumber: true } });
    if (!ticket || (user.role === 'USER' && ticket.createdById !== user.id) || !['USER', 'AGENT', 'ADMIN'].includes(user.role)) throw new AppError('Ticket not found', 404);
    const where = { ticketId: id, ...(user.role === 'AGENT' ? { assignedAgentId: user.id } : {}) };
    if (user.role === 'AGENT' && !await tx.ticketResolutionCycle.count({ where })) throw new AppError('Ticket not found', 404);
    const [cycles, total] = await Promise.all([
      tx.ticketResolutionCycle.findMany({ where, select: cycleSelect, orderBy: { number: 'desc' }, skip: (page - 1) * limit, take: limit }),
      tx.ticketResolutionCycle.count({ where }),
    ]);
    const now = new Date();
    return { ticketId: id, serverNow: now, cycles: cycles.map((cycle) => presentCycle(cycle, ticket, user, now)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }, { isolationLevel: 'RepeatableRead' });
}

async function saveFeedback(id, body, user, expectedToken, update, requestId) {
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) throw new AppError('Invalid satisfaction feedback', 422);
  if (user.role !== 'USER') throw new AppError('Only the requester may submit satisfaction feedback', 403);
  if (!expectedToken) throw new AppError('Reload feedback to obtain its version before saving', 428);
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock account then ticket. Deactivation/reopening cannot commit between
      // the authoritative checks and this write. No ticket activity is changed.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
      const account = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isActive: true } });
      if (!account?.isActive || account.role !== 'USER') throw new AppError('Account is not eligible to submit feedback', 403);
      await tx.$queryRaw`SELECT "id" FROM "tickets" WHERE "id" = ${id} FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket || ticket.createdById !== account.id) throw new AppError('Ticket not found', 404);
      if (!terminal(ticket.status)) throw conflict();
      const cycle = await tx.ticketResolutionCycle.findUnique({ where: { ticketId_number: { ticketId: id, number: ticket.satisfactionCycleNumber } }, select: cycleSelect });
      if (!cycle || cycle.requesterId !== account.id || expectedToken !== token(cycle)) throw conflict();
      if (Boolean(cycle.satisfaction) !== Boolean(update)) throw conflict();
      if (new Date() >= deadline(cycle)) throw new AppError('The 14-day feedback period has ended', 409);
      if (update) {
        const changed = await tx.ticketSatisfaction.updateMany({ where: { id: cycle.satisfaction.id, requesterId: account.id, cycleId: cycle.id, version: cycle.satisfaction.version }, data: { ...parsed.data, version: { increment: 1 } } });
        if (changed.count !== 1) throw conflict();
      } else {
        await tx.ticketSatisfaction.create({ data: { cycleId: cycle.id, requesterId: account.id, ...parsed.data } });
      }
      await tx.auditEvent.create({ data: { eventType: update ? 'TICKET_SATISFACTION_UPDATED' : 'TICKET_SATISFACTION_SUBMITTED', entityType: 'ticket_satisfaction', entityId: cycle.id, actorUserId: account.id, requestId,
        metadata: { ticketId: id, resolutionCycle: cycle.id, rating: parsed.data.rating, hasComment: Boolean(parsed.data.comment) } } });
      if (!update && cycle.assignedAgentId) await writeNotifications(tx, { actorId: account.id, entries: [eventEntry({
        recipientId: cycle.assignedAgentId, type: 'TICKET_SATISFACTION_RECEIVED', ticketId: id,
        title: 'Support feedback received', message: 'New satisfaction feedback was submitted for a resolved ticket.', eventId: cycle.id,
      })] });
      const saved = await tx.ticketSatisfaction.findUnique({ where: { cycleId: cycle.id }, select: feedbackSelect });
      // Expiry during the transaction rolls back feedback/audit/notification.
      const [clock] = await tx.$queryRaw`SELECT clock_timestamp() AS "now"`;
      if (new Date(clock.now) >= deadline(cycle)) throw new AppError('The 14-day feedback period has ended', 409);
      return presentCycle({ ...cycle, satisfaction: saved }, ticket, account, new Date(clock.now));
    });
  } catch (error) {
    if (['P2002', 'P2034'].includes(error.code)) throw conflict();
    throw error;
  }
}

async function listMine(user, { page = 1, limit = 10 } = {}) {
  if (user.role !== 'USER') throw new AppError('Requester access required', 403);
  const where = { requesterId: user.id };
  const [feedback, total] = await Promise.all([
    prisma.ticketSatisfaction.findMany({ where, select: { ...feedbackSelect, cycle: { select: { number: true, ticketId: true, resolvedAt: true } } }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.ticketSatisfaction.count({ where }),
  ]);
  return { feedback, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
module.exports = { WINDOW_MS, recordResolution, presentCycle, token, feedbackSelect, getTicketSatisfaction, saveFeedback, listMine };
