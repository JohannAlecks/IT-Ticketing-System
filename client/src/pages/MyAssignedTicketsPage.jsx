import { useState } from 'react';
import { useTickets } from '../hooks/useTickets';
import { useAuth } from '../context/AuthContext';
import TicketTable from '../components/tickets/TicketTable';
import Pagination from '../components/tickets/Pagination';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import TicketFilters from '../components/tickets/TicketFilters';
import SavedViewsBar from '../components/personal/SavedViewsBar';
import { Inbox } from 'lucide-react';


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

      <SavedViewsBar filters={filters} scope="ASSIGNED_TO_ME" />
      <TicketFilters filters={filters} onChange={setFilters} assignedOnly />

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
