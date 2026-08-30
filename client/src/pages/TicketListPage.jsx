import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTickets } from '../hooks/useTickets';
import TicketFilters from '../components/tickets/TicketFilters';
import TicketTable from '../components/tickets/TicketTable';
import Pagination from '../components/tickets/Pagination';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import { Ticket as TicketIcon } from 'lucide-react';

export default function TicketListPage() {
  const [filters, setFilters] = useState({ page: 1, limit: 15 });
  const { data, isLoading, isError } = useTickets(filters);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="page-subtitle">Search, prioritize, and manage support work in one place.</p>
        </div>
        <Link to="/tickets/new">
          <Button>
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        </Link>
      </div>

      <TicketFilters filters={filters} onChange={setFilters} />

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load tickets." />}

      {data && data.tickets.length === 0 && (
        <EmptyState
          icon={TicketIcon}
          title="No tickets found"
          description="Try adjusting your filters, or create a new ticket."
          action={
            <Link to="/tickets/new">
              <Button size="sm">Create ticket</Button>
            </Link>
          }
        />
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
