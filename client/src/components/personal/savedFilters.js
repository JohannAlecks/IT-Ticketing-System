// Same structured criteria as the server. Pagination and search stay transient.
export const SAVED_FILTER_KEYS = ['status', 'priority', 'category', 'assignedToId', 'slaState', 'department', 'isWorkBlocking', 'assignmentState', 'pendingReason', 'sortField', 'sortDirection', 'watchedByMe'];
export function savedFilters(filters, scope) {
  return Object.fromEntries(SAVED_FILTER_KEYS.filter((key) => !(scope === 'ASSIGNED_TO_ME' && key === 'assignedToId'))
    .filter((key) => filters[key] !== undefined && filters[key] !== '').map((key) => [key, filters[key]]));
}
export const scopeLabel = (scope) => ({ MY_TICKETS: 'My Tickets', ASSIGNED_TO_ME: 'Assigned to me', ALL_AUTHORIZED: 'All authorized tickets', ARCHIVED: 'Archived Work Items' }[scope] || 'Unavailable');
export const sameFilters = (a, b, scope) => JSON.stringify(savedFilters(a, scope)) === JSON.stringify(savedFilters(b, scope));
