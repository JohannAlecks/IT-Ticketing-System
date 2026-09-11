const AppError = require('../../utils/AppError');
const all = ['USER', 'AGENT', 'ADMIN'];
const ROUTES = Object.freeze({
  SUMMARY: { path: '/dashboard', label: 'Summary', roles: all },
  GET_STARTED: { path: '/get-started', label: 'Get started', roles: all },
  MY_TICKETS: { path: '/tickets', label: 'My Tickets', roles: ['USER'] },
  CREATE_TICKET: { path: '/tickets/new', label: 'New Ticket', roles: all },
  ASSIGNED_TICKETS: { path: '/my-tickets', label: 'Assigned Tickets', roles: ['AGENT'] },
  ARCHIVED_WORK: { path: '/tickets/archived', label: 'Archived Work Items', roles: all },
  KNOWLEDGE_BASE: { path: '/knowledge', label: 'Knowledge Base', roles: all },
  NOTIFICATIONS: { path: '/notifications', label: 'Notifications', roles: all },
  SETTINGS: { path: '/settings', label: 'Settings', roles: all },
  REPORTS: { path: '/reports', label: 'Reports', roles: ['AGENT', 'ADMIN'] },
  USERS: { path: '/users', label: 'Users', roles: ['ADMIN'] },
  AUDIT_LOGS: { path: '/audit-log', label: 'Audit Logs', roles: ['ADMIN'] },
  SLA_SETTINGS: { path: '/settings#sla-policies', label: 'SLA Settings', roles: ['ADMIN'] },
});
const SCOPES = { USER: ['MY_TICKETS', 'ARCHIVED'], AGENT: ['ASSIGNED_TO_ME', 'ALL_AUTHORIZED', 'ARCHIVED'], ADMIN: ['ALL_AUTHORIZED', 'ARCHIVED'] };
const unavailable = () => new AppError('Personal preference is unavailable', 404);
function assertViewAllowed(user, scope, filters) {
  if (!SCOPES[user.role]?.includes(scope)) throw unavailable();
  if (user.role !== 'ADMIN' && filters.department) throw unavailable();
  if (user.role === 'USER' && (filters.slaState || filters.pendingReason || filters.assignedToId || filters.assignmentState)) throw unavailable();
  if (user.role === 'AGENT' && filters.assignedToId && filters.assignedToId !== user.id) throw unavailable();
  if (scope === 'ARCHIVED' && filters.slaState) throw unavailable();
  if (scope === 'ASSIGNED_TO_ME' && filters.assignmentState === 'UNASSIGNED') throw unavailable();
  if (filters.assignmentState === 'UNASSIGNED' && (filters.assignedToId || (user.role === 'AGENT' && filters.slaState))) throw unavailable();
}
function routeFor(user, key) {
  const route = Object.hasOwn(ROUTES, key || '') ? ROUTES[key] : null;
  return route?.roles.includes(user.role) ? route : null;
}
function viewPath(view) { return `/saved-views/${encodeURIComponent(view.id)}`; }
module.exports = { ROUTES, SCOPES, assertViewAllowed, routeFor, viewPath, unavailable };
