import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSavedTickets } from '../hooks/usePersonal';
import { useTickets } from '../hooks/useTickets';
import SavedViewsBar from '../components/personal/SavedViewsBar';
import TicketFilters from '../components/tickets/TicketFilters';
import TicketTable from '../components/tickets/TicketTable';
import Pagination from '../components/tickets/Pagination';
import Button from '../components/ui/Button';
function Results({ view, data, page, setPage, draft, setDraft }) {
  const { user } = useAuth();
  const base = { ...view.filters, page, limit: 15, archive: view.scope === 'ARCHIVED' ? 'archived' : 'active', ...(view.scope === 'ASSIGNED_TO_ME' ? { assignedToId: user.id } : {}) };
  const filters = draft ? { ...draft.filters, page, archive: base.archive, ...(view.scope === 'ASSIGNED_TO_ME' ? { assignedToId: user.id } : {}) } : base;
  const preview = useTickets(filters, Boolean(draft));
  const result = draft ? preview.data : data;
  return <div className="space-y-4">
    <SavedViewsBar active={draft?.baseline || view} scope={view.scope} filters={filters} onSaved={(updated, filtersSaved) => {
      if (filtersSaved) { setDraft(null); setPage(1); }
      else setDraft((current) => current ? { ...current, baseline: updated } : null);
    }} />
    <TicketFilters filters={filters} onChange={(next) => { setDraft((current) => ({ filters: next, baseline: current?.baseline || view })); setPage(1); }} assignedOnly={view.scope === 'ASSIGNED_TO_ME'} />
    {draft && <Button variant="secondary" onClick={() => { setDraft(null); setPage(1); }}>Discard filter changes</Button>}
    {draft && preview.isLoading && <p role="status">Loading filtered tickets…</p>}
    {draft && preview.isError ? <p role="alert">Tickets could not be loaded. <Button onClick={() => preview.refetch()}>Retry tickets</Button></p> : result && <>
      {!result.tickets.length ? <p className="card p-5 text-slate-600">No tickets match this view.</p> : <TicketTable tickets={result.tickets} archive={base.archive} />}
      <Pagination pagination={result.pagination} onPageChange={setPage} />
    </>}
  </div>;
}
function SavedPage({ id }) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(null);
  const query = useSavedTickets(id, page);
  const unavailable = [401, 403, 404].includes(query.error?.response?.status);
  return <div className="space-y-5"><h1 className="page-title">Saved ticket view</h1>
    {query.isLoading && <p role="status">Loading saved ticket view…</p>}
    {query.isError && <p role="alert">This view is unavailable or could not be loaded. <Button onClick={() => query.refetch()}>Retry view</Button></p>}
    {!unavailable && query.data && <Results view={query.data.view} data={query.data} page={page} setPage={setPage} draft={draft} setDraft={setDraft} />}
  </div>;
}
export default function SavedTicketViewPage() {
  const { id } = useParams();
  const { user, role } = useAuth();
  return user?.id ? <SavedPage key={`${user.id}:${role}:${id}`} id={id} /> : null;
}
