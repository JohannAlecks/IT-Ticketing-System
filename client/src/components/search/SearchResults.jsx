import { formatDateTime, shortId } from '../../utils/format';
import TicketStatusBadge from '../tickets/StatusBadge';
export const groupLabel = { tickets: 'Tickets', knowledge: 'Knowledge Base', users: 'Users' };
// Defense in depth: never navigate using arbitrary response content.
export function safeSearchPath(result) {
  if (result.type === 'ticket') return `/tickets/${encodeURIComponent(result.id)}`;
  if (result.type === 'user') return `/users?status=ALL#user-${encodeURIComponent(result.id)}`;
  if (result.type === 'knowledge' && /^\/knowledge\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.path)) return result.path;
  return null;
}
export function visibleGroups(data, role) {
  return (data?.groups || []).filter((g) => ['tickets', 'knowledge', ...(role === 'ADMIN' ? ['users'] : [])].includes(g.type))
    .map((g) => ({ ...g, results: g.results.filter((r) => safeSearchPath(r) && (r.type !== 'user' || role === 'ADMIN')) }));
}
export function ResultContent({ result }) {
  const meta = result.metadata || {};
  return <div className="min-w-0 space-y-1 text-left">
    <div className="break-words font-medium text-slate-900">{result.type === 'ticket' && <span className="mr-2 text-slate-500">{shortId(result.id)}</span>}{result.title}</div>
    <p className="break-words text-sm text-slate-600">{result.subtitle}</p>
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {meta.status && <TicketStatusBadge status={meta.status} />}
      {meta.category && <span>{meta.category.replaceAll('_', ' ')}</span>}
      {meta.archived && <span className="archived-badge rounded border px-1">Archived</span>}
      {meta.published && <span>Published {formatDateTime(meta.publishedAt)}</span>}
      {result.type === 'user' && <><span>{meta.department || 'Department not specified'}</span><span>{meta.role}</span><span>{meta.active ? 'Active' : 'Inactive'}</span></>}
      <span>Updated {formatDateTime(result.updatedAt)}</span>
    </div>
  </div>;
}
