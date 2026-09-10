const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { writeNotifications, ticketReference, eventEntry } = require('../notifications/notification.service');
const { assertTicketVisible, assertTicketIsActive, lockActiveTicketForMutation } = require('../tickets/ticket.access');

async function listComments(ticketId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);

  assertTicketVisible(ticket, user);

  const where = { ticketId };
  // Regular users never see internal agent-only notes
  if (user.role === 'USER') where.isInternal = false;

  return prisma.comment.findMany({
    where,
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

async function addComment(ticketId, data, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);
  assertTicketVisible(ticket, user);
  assertTicketIsActive(ticket);

  if (user.role === 'USER') {
    if (data.isInternal) {
      throw new AppError('Only agents or admins can post internal notes', 403);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Re-read and guard inside the write transaction so an archive committed
    // while the request was in flight cannot receive a comment/history row.
    let currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!currentTicket) throw new AppError('Ticket not found', 404);
    assertTicketVisible(currentTicket, user);
    await lockActiveTicketForMutation(tx, currentTicket);
    currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
    assertTicketVisible(currentTicket, user);
    const comment = await tx.comment.create({
      data: {
        ticketId,
        authorId: user.id,
        content: data.content,
        isInternal: data.isInternal,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    await tx.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'COMMENTED',
        description: `${user.name} added a ${data.isInternal ? 'internal note' : 'comment'}`,
      },
    });

    // Only the first public reply by operational staff satisfies first
    // response. The conditional write is the concurrency gate: a second
    // simultaneous reply cannot rewrite the stable timestamp.
    if (!data.isInternal && ['AGENT', 'ADMIN'].includes(user.role) && ['OPEN', 'IN_PROGRESS', 'PENDING'].includes(currentTicket.status) && currentTicket.slaPolicyId && !currentTicket.firstRespondedAt) {
      const respondedAt = new Date();
      const firstResponse = await tx.ticket.updateMany({
        where: { id: ticketId, archivedAt: null, firstRespondedAt: null, slaVersion: currentTicket.slaVersion },
        data: {
          firstRespondedAt: respondedAt,
          slaVersion: { increment: 1 },
          ...(respondedAt > new Date(currentTicket.firstResponseDueAt) && !currentTicket.firstResponseBreachedAt ? { firstResponseBreachedAt: currentTicket.firstResponseDueAt } : {}),
        },
      });
      if (firstResponse.count === 1) {
        const completedBreached = Boolean(currentTicket.firstResponseBreachedAt || respondedAt > new Date(currentTicket.firstResponseDueAt));
        await tx.auditEvent.create({
          data: {
            eventType: 'sla.first_response_completed', entityType: 'ticket', entityId: ticketId, actorUserId: user.id,
            metadata: { state: completedBreached ? 'COMPLETED_BREACHED' : 'MET' },
          },
        });
        await tx.ticketHistory.create({
          data: {
            ticketId, userId: user.id, action: 'UPDATED', description: 'SLA first response completed',
            metadata: { visibility: 'internal', slaEvent: 'first_response_completed', state: completedBreached ? 'COMPLETED_BREACHED' : 'MET' },
          },
        });
      }
    }

    if (!data.isInternal) {
      // Re-read in the transaction so a concurrent reassignment cannot send a
      // public-reply notice to a stale assignee.
      const notificationTicket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { createdById: true, assignedToId: true } });
      const recipientId = user.role === 'USER' ? notificationTicket?.assignedToId : notificationTicket?.createdById;
      if (recipientId) {
        await writeNotifications(tx, {
          actorId: user.id,
          entries: [eventEntry({
            recipientId,
            type: 'TICKET_PUBLIC_REPLY',
            ticketId,
            title: 'New ticket reply',
            message: `There is a new reply on ticket ${ticketReference(ticketId)}.`,
            eventId: comment.id,
          })],
        });
      }
    }

    return comment;
  });
}

module.exports = { listComments, addComment };
