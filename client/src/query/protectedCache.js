export const PROTECTED_QUERY_SCOPE = 'protected';

// Protected data is isolated by the stable account id only. Never put a
// token or full user object in a query key.
export function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function scopedKey(userId, role, suffix) {
  return [
    PROTECTED_QUERY_SCOPE,
    userId,
    ...(role == null ? [] : [normalizeRole(role)]),
    ...suffix,
  ];
}

export const protectedQueryKeys = {
  root: (userId) => [PROTECTED_QUERY_SCOPE, userId],
  // `archive` is intentionally part of the list root so active and archived
  // pages cannot reuse one another's response, even when their filters match.
  // Omitting role preserves compatibility for callers/tests that do not have
  // an authenticated role yet; authenticated hooks always provide it.
  tickets: (userId, role, archive) => {
    const key = scopedKey(userId, role, ['tickets']);
    return archive ? [...key, String(archive).toLowerCase()] : key;
  },
  ticket: (userId, ticketId, role) => scopedKey(userId, role, ['ticket', ticketId]),
  comments: (userId, ticketId, role) => scopedKey(userId, role, ['comments', ticketId]),
  attachments: (userId, ticketId, role) => scopedKey(userId, role, ['attachments', ticketId]),
  dashboard: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'dashboard'],
  workload: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'dashboard', 'agent-workload'],
  reports: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'reports'],
  users: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'users'],
  agents: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'agents'],
  auditEvents: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'audit-events'],
  onboarding: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'onboarding'],
  notifications: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'notifications'],
  notificationPreferences: (userId, role) => [PROTECTED_QUERY_SCOPE, userId, 'notification-preferences', String(role || '').toUpperCase()],
  // Knowledge responses are role-projected (for example, support users may
  // read INTERNAL articles). Keep the role in this root so a role change can
  // never reuse a broader response from the same account.
  knowledge: (userId, role) => [PROTECTED_QUERY_SCOPE, userId, 'knowledge', String(role || '').toUpperCase()],
};

export const protectedMutationKeys = {
  ticket: (userId, action, ticketId, role) => scopedKey(userId, role, ['ticket-mutation', action, ticketId]),
  user: (userId, action, targetUserId) => [PROTECTED_QUERY_SCOPE, userId, 'user-mutation', action, targetUserId],
  attachment: (userId, action, ticketId, role) => scopedKey(userId, role, ['attachment-mutation', action, ticketId]),
  comment: (userId, ticketId, role) => scopedKey(userId, role, ['comment-mutation', ticketId]),
  onboarding: (userId) => [PROTECTED_QUERY_SCOPE, userId, 'onboarding-mutation'],
  notification: (userId, action, notificationId) => [PROTECTED_QUERY_SCOPE, userId, 'notification-mutation', action, notificationId],
  notificationPreferences: (userId, role) => [PROTECTED_QUERY_SCOPE, userId, 'notification-preferences-mutation', String(role || '').toUpperCase()],
  knowledge: (userId, role, action, articleId) => [PROTECTED_QUERY_SCOPE, userId, 'knowledge-mutation', String(role || '').toUpperCase(), action, articleId],
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

export async function refreshTicketState(queryClient, userId, ticketId, role) {
  const filters = [
    ...(ticketId ? [{ queryKey: protectedQueryKeys.ticket(userId, ticketId, role) }] : []),
    { queryKey: protectedQueryKeys.tickets(userId, role) },
    { queryKey: protectedQueryKeys.dashboard(userId) },
  ];

  await Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
}

// Archive/restore changes which side of the active/archived boundary owns a
// ticket and can affect dashboard, reports, and admin workload projections.
// Keep invalidation narrowly rooted to the current account and role; do not
// invalidate another user's protected cache or unrelated comment/attachment
// queries.
export async function invalidateTicketTransitionQueries(queryClient, userId, ticketId, role) {
  const filters = [
    { queryKey: protectedQueryKeys.tickets(userId, role, 'active') },
    { queryKey: protectedQueryKeys.tickets(userId, role, 'archived') },
    { queryKey: protectedQueryKeys.ticket(userId, ticketId, role) },
    { queryKey: protectedQueryKeys.dashboard(userId) },
    { queryKey: protectedQueryKeys.workload(userId) },
    { queryKey: protectedQueryKeys.reports(userId) },
  ];

  await Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
}

export function isConflictError(error) {
  return error?.response?.status === 409;
}
