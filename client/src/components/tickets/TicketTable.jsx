import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import { formatDate, formatDateTime, shortId } from '../../utils/format';
import { categoryLabel } from '../../constants/ticketCategories';

const ACTIVE_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'createdBy', label: 'Requester' },
  { key: 'assignedTo', label: 'Assigned Agent' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Updated' },
];

const ARCHIVED_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'createdBy', label: 'Requester' },
  { key: 'assignedTo', label: 'Assigned Agent' },
  { key: 'archivedAt', label: 'Archived' },
  { key: 'archivedBy', label: 'Archived By' },
];

// Sorting is applied client-side to the current page of results — the
// backend's /tickets endpoint doesn't take a `sort` param (it always
// orders by createdAt desc), so this sorts what's already been fetched.
export default function TicketTable({ tickets = [], archive = 'active', showArchivedBy }) {
  const navigate = useNavigate();
  const isArchived = archive === 'archived';
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const hasArchivedBy = showArchivedBy ?? tickets.some((ticket) => ticket.archivedBy?.name);
  const columns = isArchived
    ? ARCHIVED_COLUMNS.filter((column) => column.key !== 'archivedBy' || hasArchivedBy)
    : ACTIVE_COLUMNS;

  const sorted = useMemo(() => {
    if (!sortKey) return tickets;
    const copy = [...tickets];
    copy.sort((a, b) => {
      const getVal = (t) => {
        if (sortKey === 'createdBy') return t.createdBy?.name || '';
        if (sortKey === 'assignedTo') return t.assignedTo?.name || '';
        if (sortKey === 'archivedBy') return t.archivedBy?.name || '';
        return t[sortKey] ?? '';
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [tickets, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openTicket = (ticket) => navigate(`/tickets/${ticket.id}`, {
    state: { from: isArchived ? '/tickets/archived' : '/tickets' },
  });

  return (
    <div className="card overflow-x-auto" data-archive-mode={archive}>
      <table className={`${isArchived ? 'min-w-[1060px]' : 'min-w-[900px]'} divide-y divide-slate-200 text-sm`} aria-label={isArchived ? 'Archived work items' : 'Active tickets'}>
        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className="whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className="inline-flex items-center gap-1 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                  aria-label={`Sort by ${col.label}`}
                >
                  {col.label}
                  <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sorted.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => openTicket(ticket)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openTicket(ticket);
                }
              }}
              tabIndex={0}
              aria-label={`Open ${ticket.title}`}
              className="cursor-pointer transition-colors hover:bg-brand-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
            >
              <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-medium text-brand-700">
                {shortId(ticket.id)}
              </td>
              <td className="max-w-xs truncate px-4 py-4 font-semibold text-slate-900">{ticket.title}</td>
              <td className="whitespace-nowrap px-4 py-4"><StatusBadge status={ticket.status} /></td>
              <td className="whitespace-nowrap px-4 py-4"><PriorityBadge priority={ticket.priority} /></td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{categoryLabel(ticket.category)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{ticket.createdBy?.name || '—'}</td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{ticket.assignedTo?.name || <span className="text-slate-400">Unassigned</span>}</td>
              {isArchived ? (
                <>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDateTime(ticket.archivedAt)}</td>
                  {columns.some((column) => column.key === 'archivedBy') && (
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{ticket.archivedBy?.name || '—'}</td>
                  )}
                </>
              ) : (
                <>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(ticket.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(ticket.updatedAt)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
