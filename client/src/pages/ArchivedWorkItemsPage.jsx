import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Ticket as TicketIcon } from 'lucide-react';
import { useTickets } from '../hooks/useTickets';
import { useAuth } from '../context/AuthContext';
import TicketFilters from '../components/tickets/TicketFilters';
import TicketTable from '../components/tickets/TicketTable';
import Pagination from '../components/tickets/Pagination';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

export default function ArchivedWorkItemsPage() {
  const { role } = useAuth();
  const [filters, setFilters] = useState({ page: 1, limit: 15, archive: 'archived' });
  const { data, isLoading, isError, isFetching, refetch } = useTickets(filters);
  const tickets = data?.tickets || [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-brand-700">
            <Archive className="h-5 w-5" aria-hidden="true" />
            <span className="eyebrow text-brand-700">Workspace archive</span>
          </div>
          <h1 className="page-title">Archived Work Items</h1>
          <p className="page-subtitle">Read-only tickets kept for reference. Comments, attachments, and history remain available.</p>
        </div>
        <Link to="/tickets">
          <Button variant="secondary" size="sm">View active tickets</Button>
        </Link>
      </header>

      <TicketFilters filters={filters} onChange={setFilters} />

      {isLoading && <Spinner label="Loading archived work items" />}
      {isError && (
        <ErrorState
          message="Couldn't load archived work items."
          onRetry={refetch}
          retrying={isFetching}
        />
      )}
      {!isLoading && !isError && tickets.length === 0 && (
        <EmptyState
          icon={TicketIcon}
          title="No archived work items"
          description="Resolved and closed tickets moved to the archive will appear here."
          action={<Link to="/tickets"><Button size="sm">View active tickets</Button></Link>}
        />
      )}

      {!isLoading && !isError && tickets.length > 0 && (
        <>
          <div role="status" aria-live="polite" className="sr-only">
            {isFetching ? 'Refreshing archived work items' : ''}
          </div>
          <TicketTable tickets={tickets} archive="archived" showArchivedBy={role === 'ADMIN'} />
          <Pagination pagination={data.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
        </>
      )}
    </div>
  );
}
