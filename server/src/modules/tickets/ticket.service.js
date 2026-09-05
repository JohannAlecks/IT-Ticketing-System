const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const fs = require('fs');
const { resolveUploadPath } = require('../../middleware/upload');
const { recordAudit } = require('../audit/audit.service');
const { writeNotifications, ticketReference, statusLabel, eventEntry } = require('../notifications/notification.service');
const { buildTicketVisibilityFilter, assertTicketVisible, assertTicketIsActive } = require('./ticket.access');

function ticketInclude(user) {
  return {
    createdBy: { select: { id: true, name: true, email: true, department: true } },
    assignedTo: {
      select: user.role === 'USER'
        ? { id: true, name: true }
        : { id: true, name: true, email: true },
    },
    ...(user.role === 'ADMIN' ? { archivedBy: { select: { id: true, name: true } } } : {}),
    _count: {
      select: {
        comments: user.role === 'USER' ? { where: { isInternal: false } } : true,
      },
    },
  };
}

// Allowed status transitions. Enforced server-side so the workflow can't be
// bypassed by calling the API directly, regardless of what the UI shows.
const ALLOWED_TRANSITIONS = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'RESOLVED', 'OPEN'],
  PENDING: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

/**
 * Builds a Prisma `where` clause that enforces role-based visibility:
 * - USER: only sees tickets they created
 * - AGENT: sees tickets assigned to them, or unassigned tickets (so they can pick up work)
 * - ADMIN: sees everything
 */
function exposeTicket(ticket, user) {
  if (!ticket || user.role === 'ADMIN') return ticket;
  const { archivedById, archivedBy, ...visibleTicket } = ticket;
  return visibleTicket;
}

async function listTickets(user, query) {
  const { status, priority, category, assignedToId, search, archive, page, limit } = query;

  const where = {
    AND: [
      buildTicketVisibilityFilter(user),
      archive === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null },
      status ? { status } : {},
      priority ? { priority } : {},
      category ? { category } : {},
      assignedToId ? { assignedToId } : {},
      search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketInclude(user),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets: tickets.map((ticket) => exposeTicket(ticket, user)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getTicketById(id, user) {
  // SECURITY FIX: this previously embedded ALL comments (including internal
  // agent-only notes) unconditionally, unlike the dedicated
  // GET /tickets/:ticketId/comments endpoint which correctly filters them.
  // Since the Ticket Detail page renders `ticket.comments` from this exact
  // response, a plain USER fetching their own ticket would have received
  // internal notes in the payload. The filter below is applied at the query
  // level (not just hidden client-side) so a USER's response never contains
  // internal-note rows in the first place.
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      ...ticketInclude(user),
      comments: {
        where: user.role === 'USER' ? { isInternal: false } : undefined,
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      history: {
        // A USER shouldn't learn that an internal note exists at all, even
        // without seeing its content — history rows for internal notes are
        // identified by their description text (TicketHistory has no
        // isInternal column of its own; the comment does).
        where: user.role === 'USER' ? { NOT: { description: { contains: 'internal note' } } } : undefined,
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!ticket) throw new AppError('Ticket not found', 404);

  assertTicketVisible(ticket, user);
  return exposeTicket(ticket, user);
}

async function createTicket(data, user) {
  const isWorkBlocking = Boolean(data.isWorkBlocking);
  if (isWorkBlocking && (!data.impactDescription || !data.impactDescription.trim())) {
    throw new AppError('Explain how this is blocking your work', 422);
  }
  const impactDescription = isWorkBlocking ? data.impactDescription.trim() : null;
  // A requester never controls technical priority through the API. Agents and
  // admins may supply a triage priority when creating on someone's behalf.
  const priority = user.role === 'USER'
    ? (isWorkBlocking ? 'HIGH' : 'MEDIUM')
    : (data.priority || (isWorkBlocking ? 'HIGH' : 'MEDIUM'));

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        title: data.title,
        description: data.description,
        priority,
        category: data.category || 'OTHERS',
        isWorkBlocking,
        impactDescription,
        createdById: user.id,
      },
      include: ticketInclude(user),
    });

    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: 'CREATED',
        description: `Ticket created by ${user.name}`,
      },
    });

    if (isWorkBlocking) {
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
      await writeNotifications(tx, {
        actorId: user.id,
        entries: admins.map((admin) => eventEntry({
          recipientId: admin.id,
          type: 'TICKET_WORK_BLOCKING',
          ticketId: ticket.id,
          title: 'Work-blocking ticket',
          message: `A work-blocking ticket ${ticketReference(ticket.id)} was created.`,
          eventId: ticket.id,
        })),
      });
    }

    return ticket;
  });
}

async function updateTicket(id, data, user) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({ where: { id } });
    if (!existing) throw new AppError('Ticket not found', 404);
    assertTicketVisible(existing, user);
    assertTicketIsActive(existing);

    if (user.role === 'USER') {
      if (data.status || data.priority) throw new AppError('Only agents or admins can change status or priority', 403);
    }
    if (existing.status === 'CLOSED' && data.priority) {
      throw new AppError('This ticket is closed. Reopen it before changing priority.', 422);
    }
    if (data.status && data.status !== existing.status) {
      const allowedNext = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowedNext.includes(data.status)) {
        throw new AppError(`Cannot move a ticket from ${existing.status} to ${data.status}. Allowed next steps: ${allowedNext.length ? allowedNext.join(', ') : 'none (ticket is closed)'}`, 422);
      }
    }

    const historyEntries = [];
    if (data.status && data.status !== existing.status) {
      historyEntries.push({ ticketId: id, userId: user.id, action: 'STATUS_CHANGED', description: `${user.name} changed status from ${existing.status} to ${data.status}`, metadata: { from: existing.status, to: data.status } });
    }
    if (data.priority && data.priority !== existing.priority) {
      historyEntries.push({ ticketId: id, userId: user.id, action: 'PRIORITY_CHANGED', description: `${user.name} changed priority from ${existing.priority} to ${data.priority}`, metadata: { from: existing.priority, to: data.priority } });
    }
    if (Object.keys(data).some((key) => !['status', 'priority'].includes(key))) {
      historyEntries.push({ ticketId: id, userId: user.id, action: 'UPDATED', description: `${user.name} updated ticket details` });
    }

    const result = await tx.ticket.updateMany({
      where: { id, archivedAt: null, status: existing.status, priority: existing.priority, assignedToId: existing.assignedToId, updatedAt: existing.updatedAt },
      data: { ...data, closedAt: data.status === 'CLOSED' ? new Date() : data.status ? null : undefined },
    });
    if (result.count !== 1) throw new AppError('This ticket was changed by another request. Refresh and try again.', 409);

    const updated = await tx.ticket.findUnique({ where: { id }, include: ticketInclude(user) });
    if (historyEntries.length) await tx.ticketHistory.createMany({ data: historyEntries });
    if (data.status && data.status !== existing.status) {
      await writeNotifications(tx, {
        actorId: user.id,
        entries: [existing.createdById, existing.assignedToId].filter(Boolean).map((recipientId) => eventEntry({
          recipientId,
          type: 'TICKET_STATUS_CHANGED',
          ticketId: id,
          title: 'Ticket status updated',
          message: `Ticket ${ticketReference(id)} is now ${statusLabel(data.status)}.`,
          eventId: `${id}:${existing.status}:${data.status}:${updated.updatedAt ? new Date(updated.updatedAt).toISOString() : ''}`,
        })),
      });
    }
    return exposeTicket(updated, user);
  });
}

async function assignTicket(id, assignedToId, user) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({ where: { id } });
    if (!existing) throw new AppError('Ticket not found', 404);
    assertTicketVisible(existing, user);
    assertTicketIsActive(existing);
    if (existing.status === 'CLOSED') throw new AppError('This ticket is closed. Reopen it before changing assignment.', 422);

    if (assignedToId) {
      const agent = await tx.user.findUnique({ where: { id: assignedToId } });
      if (!agent || agent.isActive === false || !['AGENT', 'ADMIN'].includes(agent.role)) {
        throw new AppError('Tickets can only be assigned to an Agent or Admin', 422);
      }
    }
    if (user.role === 'AGENT') {
      if (assignedToId && assignedToId !== user.id) throw new AppError('Agents can only assign tickets to themselves', 403);
    }
    if ((existing.assignedToId || null) === (assignedToId || null)) {
      return exposeTicket(await tx.ticket.findUnique({ where: { id }, include: ticketInclude(user) }), user);
    }

    const result = await tx.ticket.updateMany({
      where: { id, archivedAt: null, status: existing.status, priority: existing.priority, assignedToId: existing.assignedToId, updatedAt: existing.updatedAt },
      data: { assignedToId },
    });
    if (result.count !== 1) throw new AppError('This ticket was changed by another request. Refresh and try again.', 409);

    const updated = await tx.ticket.findUnique({ where: { id }, include: ticketInclude(user) });
    let description;
    if (assignedToId && assignedToId === user.id) description = `${user.name} assigned this ticket to themselves`;
    else if (assignedToId && existing.assignedToId) description = `${user.name} reassigned this ticket to ${updated.assignedTo.name}`;
    else if (assignedToId) description = `${user.name} assigned this ticket to ${updated.assignedTo.name}`;
    else description = `${user.name} unassigned this ticket`;
    await tx.ticketHistory.create({
      data: { ticketId: id, userId: user.id, action: assignedToId ? 'ASSIGNED' : 'UNASSIGNED', description, metadata: { from: existing.assignedToId, to: assignedToId } },
    });
    await writeNotifications(tx, {
      actorId: user.id,
      entries: [
        ...(assignedToId ? [eventEntry({ recipientId: assignedToId, type: 'TICKET_ASSIGNED', ticketId: id, title: 'Ticket assigned', message: `Ticket ${ticketReference(id)} was assigned to you.`, eventId: `${id}:${assignedToId}:${updated.updatedAt ? new Date(updated.updatedAt).toISOString() : ''}` })] : []),
        ...(existing.assignedToId ? [eventEntry({ recipientId: existing.assignedToId, type: 'TICKET_UNASSIGNED', ticketId: id, title: 'Ticket unassigned', message: `You are no longer assigned to ticket ${ticketReference(id)}.`, eventId: `${id}:${existing.assignedToId}:${updated.updatedAt ? new Date(updated.updatedAt).toISOString() : ''}` })] : []),
      ],
    });
    return exposeTicket(updated, user);
  });
}

function archiveMetadata(timestamp, archived) {
  return {
    previous: { archived: !archived, archivedAt: archived ? null : timestamp?.toISOString() || null },
    current: { archived, archivedAt: archived ? timestamp.toISOString() : null },
  };
}

async function setArchivedState(id, user, archived) {
  return prisma.$transaction(async (tx) => {
    // Scope this lookup to the normal visibility rule. An invisible ticket
    // intentionally has the same response as a missing ticket.
    const ticket = await tx.ticket.findFirst({
      where: { AND: [{ id }, buildTicketVisibilityFilter(user)] },
    });
    if (!ticket) throw new AppError('Ticket not found', 404);
    if (user.role === 'USER') throw new AppError('You do not have permission to archive tickets', 403);
    if (!archived && user.role !== 'ADMIN') throw new AppError('You do not have permission to restore tickets', 403);
    if (Boolean(ticket.archivedAt) === archived) {
      throw new AppError(archived ? 'Ticket is already archived' : 'Ticket is not archived', 409);
    }
    if (archived && !['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new AppError('Only resolved or closed tickets can be archived', 409);
    }
    if (archived && user.role === 'AGENT' && ticket.assignedToId !== user.id) {
      throw new AppError('Agents can only archive tickets assigned to themselves', 403);
    }

    const timestamp = archived ? new Date() : ticket.archivedAt;
    const result = await tx.ticket.updateMany({
      where: {
        id,
        updatedAt: ticket.updatedAt,
        ...(archived ? { archivedAt: null } : { archivedAt: { not: null } }),
      },
      data: archived ? { archivedAt: timestamp, archivedById: user.id } : { archivedAt: null, archivedById: null },
    });
    if (result.count !== 1) throw new AppError('This ticket was changed by another request. Refresh and try again.', 409);

    const metadata = archiveMetadata(timestamp, archived);
    await tx.ticketHistory.create({
      data: {
        ticketId: id,
        userId: user.id,
        action: archived ? 'TICKET_ARCHIVED' : 'TICKET_RESTORED',
        description: `${user.name} ${archived ? 'archived' : 'restored'} this ticket`,
        metadata,
      },
    });
    await tx.auditEvent.create({
      data: {
        eventType: archived ? 'ticket.archived' : 'ticket.restored',
        entityType: 'ticket',
        entityId: id,
        actorUserId: user.id,
        metadata,
      },
    });
    return exposeTicket(await tx.ticket.findUnique({ where: { id }, include: ticketInclude(user) }), user);
  });
}

const archiveTicket = (id, user) => setArchivedState(id, user, true);
const restoreTicket = (id, user) => setArchivedState(id, user, false);

async function deleteTicket(id, auditContext = {}) {
  const attachments = await prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { id },
      include: { attachments: { select: { id: true, storagePath: true, originalFileName: true } } },
    });
    if (!existing) throw new AppError('Ticket not found', 404);
    assertTicketIsActive(existing);
    // All paths must be valid before the cascade removes any attachment
    // metadata. This prevents an unsafe row from producing a partial delete.
    const inventory = existing.attachments.map((attachment) => ({ ...attachment, absolutePath: resolveUploadPath(attachment.storagePath) }));
    const deleted = await tx.ticket.deleteMany({ where: { id, archivedAt: null, updatedAt: existing.updatedAt } });
    if (deleted.count !== 1) throw new AppError('This ticket was changed by another request. Refresh and try again.', 409);
    return inventory;
  });

  const failures = [];
  for (const attachment of attachments) {
    try {
      await fs.promises.unlink(attachment.absolutePath);
    } catch (error) {
      if (error.code !== 'ENOENT') failures.push({ attachment, error });
    }
  }
  if (failures.length) {
    await Promise.all(failures.map(({ attachment, error }) => recordAudit({
      eventType: 'attachment.cleanup_failed',
      entityType: 'attachment',
      entityId: attachment.id,
      actorUserId: auditContext.actorUserId,
      requestId: auditContext.requestId,
      metadata: { ticketId: id, operation: 'ticket.delete', storagePath: attachment.storagePath, error: error.message },
    })));
    throw new AppError(`Ticket was deleted, but ${failures.length} attachment file cleanup operation(s) failed.`, 500);
  }
}

module.exports = {
  listTickets,
  getTicketById,
  createTicket,
  updateTicket,
  assignTicket,
  archiveTicket,
  restoreTicket,
  deleteTicket,
};
