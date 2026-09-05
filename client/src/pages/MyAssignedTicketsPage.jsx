import { useState } from 'react';
import { useTickets } from '../hooks/useTickets';
import { useAuth } from '../context/AuthContext';
import TicketTable from '../components/tickets/TicketTable';
import Pagination from '../components/tickets/Pagination';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { Search, Inbox } from 'lucide-react';
import { ticketCategories } from '../constants/ticketCategories';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// This view is scoped strictly to `assignedToId: me` — unlike the general
// Tickets page (which, for an Agent, also shows unassigned tickets so they
// can be picked up), this is purely "my active workload".
export default function MyAssignedTicketsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ page: 1, limit: 15, archive: 'active' });

  const query = { ...filters, assignedToId: user?.id };
  const { data, isLoading, isError, isFetching, refetch } = useTickets(query);

  // Lightweight summary counts computed from the current filtered result set's
  // pagination total isn't per-status, so we fetch small unfiltered counts by
  // reusing the same query without status filter for the summary row.
  const { data: allMine } = useTickets({ page: 1, limit: 100, assignedToId: user?.id, archive: 'active' });
  const summary = (allMine?.tickets || []).reduce(
    (acc, t) => {
      acc.total += 1;
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  const update = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Assigned Tickets</h1>
        <p className="text-sm text-gray-500">Tickets currently assigned to you</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          ['Assigned to Me', summary.total],
          ['Open', summary.OPEN || 0],
          ['In Progress', summary.IN_PROGRESS || 0],
          ['Pending', summary.PENDING || 0],
          ['Resolved', summary.RESOLVED || 0],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search title or description..."
              value={filters.search || ''}
              onChange={(e) => update({ search: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="w-40">
          <Select label="Status" value={filters.status || ''} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Select label="Priority" value={filters.priority || ''} onChange={(e) => update({ priority: e.target.value || undefined })}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Select label="Category" value={filters.category || ''} onChange={(e) => update({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {ticketCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </Select>
        </div>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load your active assigned tickets." onRetry={refetch} retrying={isFetching} />}

      {data && data.tickets.length === 0 && (
        <EmptyState icon={Inbox} title="Nothing assigned to you right now" description="Pick up an unassigned ticket from the main Tickets list." />
      )}

      {data && data.tickets.length > 0 && (
        <>
          <TicketTable tickets={data.tickets} />
          <Pagination pagination={data.pagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
        </>
      )}
    </div>
  );
}
