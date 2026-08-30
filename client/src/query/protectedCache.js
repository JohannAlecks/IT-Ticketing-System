export const PROTECTED_QUERY_SCOPE = 'protected';

// Protected data is isolated by the stable account id only. Never put a
// token or full user object in a query key.
export const protectedQueryKeys = {
  root: (userId) => [PROTECTED_QUERY_SCOPE, userId],
  tickets: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'tickets'],
  ticket: (userId, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'ticket', ticketId],
  comments: (userId, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'comments', ticketId],
  attachments: (userId, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'attachments', ticketId],
  dashboard: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'dashboard'],
  reports: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'reports'],
  users: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'users'],
  agents: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'agents'],
  auditEvents: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'audit-events'],
  onboarding: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'onboarding'],
};

export const protectedMutationKeys = {
  ticket: (userId, action, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'ticket-mutation', action, ticketId],
  user: (userId, action, targetUserId) => [PROTECTED_QUERY_SCOPE, userId, 'user-mutation', action, targetUserId],
  attachment: (userId, action, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'attachment-mutation', action, ticketId],
  comment: (userId, ticketId) => [PROTECTED_QUERY_SCOPE, userId, 'comment-mutation', ticketId],
  onboarding: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'onboarding-mutation'],
};

export function isProtectedQuery(query) {
  return query.queryKey[0] === PROTECTED_QUERY_SCOPE;
}

export function isProtectedMutation(mutation) {
  return mutation.options.mutationKey?.[0] === PROTECTED_QUERY_SCOPE;
}

// Cancelling before removal aborts query functions that honor the TanStack
// AbortSignal, while removing the query keeps any late response detached from
// the cache. Public data deliberately does not match this predicate.
export async function clearProtectedCache(queryClient) {
  await queryClient.cancelQueries({ predicate: isProtectedQuery });
  queryClient.removeQueries({ predicate: isProtectedQuery });
  queryClient.getMutationCache()
    .findAll({ predicate: isProtectedMutation })
    .forEach((mutation) => queryClient.getMutationCache().remove(mutation));
}

export async function refreshTicketState(queryClient, userId, ticketId) {
  const filters = [
    ...(ticketId ? [{ queryKey: protectedQueryKeys.ticket(userId, ticketId) }] : []),
    { queryKey: protectedQueryKeys.tickets(userId) },
    { queryKey: protectedQueryKeys.dashboard(userId) },
  ];

  await Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
}

export function isConflictError(error) {
  return error?.response?.status === 409;
}
