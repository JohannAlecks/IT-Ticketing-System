import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useAuditEvents } from '../hooks/useAuditEvents';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import { formatDateTime } from '../utils/format';

const labels = {
  'auth.login_succeeded': 'Signed in', 'ticket.created': 'Created ticket', 'ticket.updated': 'Updated ticket',
  'ticket.assigned': 'Assigned ticket', 'ticket.unassigned': 'Unassigned ticket', 'ticket.deleted': 'Deleted ticket',
  'ticket.comment_created': 'Added public comment', 'ticket.internal_note_created': 'Added internal note',
  'attachment.uploaded': 'Uploaded attachment', 'attachment.deleted': 'Deleted attachment',
  'user.created': 'Created user', 'user.role_changed': 'Changed user role', 'user.activated': 'Activated user', 'user.deactivated': 'Deactivated user',
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ page: 1, limit: 25 });
  const { data, isLoading, isError } = useAuditEvents(filters);
  const changePage = (page) => setFilters((current) => ({ ...current, page }));

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow text-brand-700">Administration</p><h1 className="page-title">Audit log</h1><p className="page-subtitle">Security-relevant activity across your HelpDesk.</p></div><select aria-label="Filter audit events" className="input w-full sm:w-56" value={filters.eventType || ''} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value || undefined, page: 1 }))}><option value="">All activity</option><option value="ticket.created">Ticket created</option><option value="ticket.updated">Ticket updated</option><option value="ticket.assigned">Ticket assigned</option><option value="ticket.comment_created">Public comment</option><option value="ticket.internal_note_created">Internal note</option><option value="attachment.uploaded">Attachment uploaded</option><option value="user.role_changed">User role changed</option></select></div>
    {isLoading && <Spinner />}{isError && <ErrorState message="Couldn't load audit events. Apply the audit migration and restart the server, then try again." />}
    {data && !data.events.length && <EmptyState icon={ShieldCheck} title="No matching audit events" description="New security-relevant activity will appear here." />}
    {data?.events?.length > 0 && <><div className="card overflow-x-auto"><table className="min-w-[760px] divide-y divide-slate-200 text-sm"><thead className="bg-slate-50"><tr>{['Event', 'Actor', 'Resource', 'When', 'Request ID'].map((label) => <th key={label} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.events.map((entry) => <tr key={entry.id}><td className="px-4 py-3.5 font-semibold text-slate-800">{labels[entry.eventType] || entry.eventType}</td><td className="px-4 py-3.5 text-slate-600">{entry.actor?.name || 'System'}</td><td className="px-4 py-3.5 text-slate-600">{entry.entityType} <span className="font-mono text-xs text-slate-400">{entry.entityId.slice(0, 8)}</span></td><td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDateTime(entry.createdAt)}</td><td className="px-4 py-3.5 font-mono text-xs text-slate-400">{entry.requestId?.slice(0, 12) || '—'}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{data.pagination.total} event{data.pagination.total === 1 ? '' : 's'}</p><div className="flex gap-2"><button className="btn border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:opacity-50" disabled={filters.page <= 1} onClick={() => changePage(filters.page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</button><button className="btn border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:opacity-50" disabled={filters.page >= data.pagination.totalPages} onClick={() => changePage(filters.page + 1)}>Next <ChevronRight className="h-4 w-4" /></button></div></div></>}
  </div>;
}
