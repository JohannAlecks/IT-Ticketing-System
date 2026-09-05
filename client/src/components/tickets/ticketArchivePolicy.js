const ARCHIVABLE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

export function canArchiveTicket(ticket, role, userId) {
  if (!ticket || !ARCHIVABLE_STATUSES.has(ticket.status)) return false;
  const normalizedRole = String(role || '').toUpperCase();
  if (normalizedRole === 'ADMIN') return true;
  return normalizedRole === 'AGENT' && ticket.assignedTo?.id === userId;
}

export { ARCHIVABLE_STATUSES };
