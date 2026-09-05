const AppError = require('../../utils/AppError');

const ARCHIVED_MUTATION_MESSAGE = 'Archived tickets cannot be changed. Restore the ticket before making changes.';

function buildTicketVisibilityFilter(user) {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'AGENT') {
    return { OR: [{ assignedToId: user.id }, { assignedToId: null }] };
  }
  return { createdById: user.id };
}

function assertTicketVisible(ticket, user) {
  if (user.role === 'USER' && ticket.createdById !== user.id) {
    throw new AppError('You do not have access to this ticket', 403);
  }
  if (user.role === 'AGENT' && ticket.assignedToId && ticket.assignedToId !== user.id) {
    throw new AppError('You do not have access to this ticket', 403);
  }
}

function assertTicketIsActive(ticket) {
  if (ticket.archivedAt) throw new AppError(ARCHIVED_MUTATION_MESSAGE, 409);
}

// A write-side guard: the conditional touch holds the ticket row lock until
// the surrounding transaction commits. That prevents an archive from
// slipping between the re-read and a dependent comment/attachment write.
async function lockActiveTicketForMutation(tx, ticket) {
  assertTicketIsActive(ticket);
  const result = await tx.ticket.updateMany({
    where: { id: ticket.id, archivedAt: null, updatedAt: ticket.updatedAt },
    data: { updatedAt: new Date() },
  });
  if (result.count !== 1) {
    throw new AppError('This ticket was changed by another request. Refresh and try again.', 409);
  }
}

module.exports = {
  ARCHIVED_MUTATION_MESSAGE,
  buildTicketVisibilityFilter,
  assertTicketVisible,
  assertTicketIsActive,
  lockActiveTicketForMutation,
};
