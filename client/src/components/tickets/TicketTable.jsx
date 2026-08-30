import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import { formatDate, shortId } from '../../utils/format';
import { categoryLabel } from '../../constants/ticketCategories';

const COLUMNS = [
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

// Sorting is applied client-side to the current page of results — the
// backend's /tickets endpoint doesn't take a `sort` param (it always
// orders by createdAt desc), so this sorts what's already been fetched.
export default function TicketTable({ tickets }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return tickets;
    const copy = [...tickets];
    copy.sort((a, b) => {
      const getVal = (t) => {
        if (sortKey === 'createdBy') return t.createdBy?.name || '';
        if (sortKey === 'assignedTo') return t.assignedTo?.name || '';
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

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="cursor-pointer select-none whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  <ArrowUpDown className="h-3 w-3 opacity-40" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sorted.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              className="cursor-pointer transition-colors hover:bg-brand-50/40"
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
              <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(ticket.createdAt)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(ticket.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
