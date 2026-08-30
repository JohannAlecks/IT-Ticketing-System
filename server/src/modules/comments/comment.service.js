const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function listComments(ticketId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);

  if (user.role === 'USER' && ticket.createdById !== user.id) {
    throw new AppError('You do not have access to this ticket', 403);
  }
  // Same rule as ticket.service.js: an AGENT may only act on tickets that
  // are unassigned or assigned to them.
  if (user.role === 'AGENT' && ticket.assignedToId && ticket.assignedToId !== user.id) {
    throw new AppError('You do not have access to this ticket', 403);
  }

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

  if (user.role === 'USER') {
    if (ticket.createdById !== user.id) {
      throw new AppError('You do not have access to this ticket', 403);
    }
    if (data.isInternal) {
      throw new AppError('Only agents or admins can post internal notes', 403);
    }
  }
  if (user.role === 'AGENT' && ticket.assignedToId && ticket.assignedToId !== user.id) {
    throw new AppError('You do not have access to this ticket', 403);
  }

  return prisma.$transaction(async (tx) => {
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

    return comment;
  });
}

module.exports = { listComments, addComment };
