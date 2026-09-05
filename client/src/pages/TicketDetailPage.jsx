import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Archive, ArrowLeft, RotateCcw, Trash2, Mail, ShieldAlert, SearchX } from 'lucide-react';
import { useTicket, useDeleteTicket, useArchiveTicket, useRestoreTicket } from '../hooks/useTickets';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/tickets/StatusBadge';
import PriorityBadge from '../components/tickets/PriorityBadge';
import TicketControls from '../components/tickets/TicketControls';
import CommentList from '../components/tickets/CommentList';
import CommentForm from '../components/tickets/CommentForm';
import HistoryTimeline from '../components/tickets/HistoryTimeline';
import TicketAttachments from '../components/tickets/TicketAttachments';
import { canArchiveTicket } from '../components/tickets/ticketArchivePolicy';
import { formatDateTime, shortId } from '../utils/format';
import { categoryLabel } from '../constants/ticketCategories';

// Distinct, useful messaging per failure mode rather than one generic
// "something went wrong" — matches what the backend actually returns
// (404 for missing, 403 for visible-but-not-yours).
function TicketErrorState({ error }) {
  const status = error?.response?.status;

  if (status === 404) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 px-6 text-center">
        <SearchX className="mb-3 h-8 w-8 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Ticket not found</h2>
        <p className="mt-1 text-sm text-gray-500">This ticket doesn't exist or may have been deleted.</p>
      </div>
    );
  }

  if (status === 403) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 py-16 px-6 text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-amber-500" />
        <h2 className="text-sm font-semibold text-amber-800">You don't have access to this ticket</h2>
        <p className="mt-1 text-sm text-amber-700">
          {error?.response?.data?.message || 'This ticket is not assigned to you or wasn\u2019t created by you.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 px-6 text-center">
      <ShieldAlert className="mb-3 h-8 w-8 text-red-500" />
      <h2 className="text-sm font-semibold text-red-700">Couldn't load this ticket</h2>
      <p className="mt-1 text-sm text-red-600">
        {error?.response?.data?.message || 'A server error occurred. Please try again.'}
      </p>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useAuth();
  const { data: ticket, isLoading, isError, error } = useTicket(id);
  const deleteTicket = useDeleteTicket();
  const archiveTicket = useArchiveTicket(id);
  const restoreTicket = useRestoreTicket(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [tab, setTab] = useState('comments');

  if (isLoading) return <Spinner />;
  if (isError || !ticket) return <TicketErrorState error={error} />;

  const isArchived = Boolean(ticket.archivedAt);
  const canArchive = !isArchived && canArchiveTicket(ticket, role, user?.id);
  const returnPath = location.state?.from || (isArchived ? '/tickets/archived' : '/tickets');

  const handleDelete = () => {
    deleteTicket.mutate(ticket.id, {
      onSuccess: () => navigate('/tickets'),
    });
  };

  const handleArchive = () => {
    archiveTicket.mutate(undefined, {
      onSuccess: () => navigate('/tickets/archived', { replace: true }),
    });
  };

  const handleRestore = () => {
    restoreTicket.mutate(undefined, {
      onSuccess: () => navigate('/tickets', { replace: true }),
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <button
        onClick={() => navigate(returnPath)}
        className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> {isArchived ? 'Back to archived work items' : 'Back to tickets'}
      </button>

      {isArchived && (
        <section className="archived-banner mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status" aria-labelledby="archived-ticket-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Archive className="archived-banner-icon mt-0.5 h-5 w-5 flex-none text-amber-700" aria-hidden="true" />
              <div>
                <h2 id="archived-ticket-heading" className="text-sm font-semibold">Archived work item</h2>
                <p className="archived-banner-copy mt-1 max-w-2xl text-sm text-amber-800">This ticket is read-only. Comments, attachments, and activity history are preserved.</p>
              </div>
            </div>
            {role === 'ADMIN' && (
              <Button variant="secondary" size="sm" onClick={() => setRestoreConfirmOpen(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            )}
          </div>
          <dl className="archived-banner-meta mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-amber-200 pt-3 text-xs text-amber-800">
            {ticket.archivedAt && (
              <div>
                <dt className="font-semibold uppercase tracking-wide">Archived</dt>
                <dd className="mt-0.5">{formatDateTime(ticket.archivedAt)}</dd>
              </div>
            )}
            {role === 'ADMIN' && ticket.archivedBy?.name && (
              <div>
                <dt className="font-semibold uppercase tracking-wide">Archived by</dt>
                <dd className="mt-0.5">{ticket.archivedBy.name}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header + full description */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3"><p className="eyebrow">Ticket workspace</p></div>
            <div className="p-5">
            <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-xs font-medium text-brand-700">{shortId(ticket.id)}</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{ticket.title}</h1>
              </div>
              <div className="flex gap-2">
                {isArchived && <span className="archived-badge inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Archived</span>}
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
            </div>

            {/* Full, untruncated description */}
            <p className="mt-5 whitespace-pre-wrap break-words border-l-2 border-brand-200 pl-4 text-sm leading-6 text-slate-600">
              {ticket.description}
            </p>
            {(role === 'AGENT' || role === 'ADMIN') && ticket.isWorkBlocking && (
              <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" aria-labelledby="work-impact-heading">
                <h2 id="work-impact-heading" className="font-semibold">Requester reported a work-blocking impact</h2>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{ticket.impactDescription}</p>
              </section>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-400">Category</dt>
                <dd className="text-gray-700">{categoryLabel(ticket.category)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Requester</dt>
                <dd className="text-gray-700">{ticket.createdBy?.name || '—'}</dd>
                {!isArchived && ticket.createdBy?.email && (
                  <dd className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Mail className="h-3 w-3" /> {ticket.createdBy.email}
                  </dd>
                )}
                <dd className="mt-0.5 text-xs text-gray-400">{ticket.createdBy?.department || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Assigned Agent</dt>
                <dd className="text-gray-700">{ticket.assignedTo?.name || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Created</dt>
                <dd className="text-gray-700">{formatDateTime(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Updated</dt>
                <dd className="text-gray-700">{formatDateTime(ticket.updatedAt)}</dd>
              </div>
            </dl>

            {(canArchive || (role === 'ADMIN' && !isArchived)) && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap gap-2">
                  {canArchive && (
                    <Button variant="secondary" size="sm" onClick={() => setArchiveConfirmOpen(true)}>
                      <Archive className="h-3.5 w-3.5" /> Archive ticket
                    </Button>
                  )}
                  {role === 'ADMIN' && !isArchived && (
                    <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete ticket
                    </Button>
                  )}
                </div>
              </div>
            )}</div>
          </div>

          {/* Tabs: comments / activity */}
          <div className="card p-5">
            <div className="mb-4 flex gap-4 border-b border-gray-100">
              <button
                onClick={() => setTab('comments')}
                className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
                  tab === 'comments' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'
                }`}
              >
                Conversation ({ticket.comments?.length || 0})
              </button>
              <button
                onClick={() => setTab('history')}
                className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
                  tab === 'history' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'
                }`}
              >
                Activity
              </button>
            </div>

            {tab === 'comments' ? (
              <div className="space-y-5">
                <CommentList comments={ticket.comments} />
                {!isArchived && (
                  <div className="border-t border-gray-100 pt-4">
                    <CommentForm ticketId={ticket.id} />
                  </div>
                )}
              </div>
            ) : (
              <HistoryTimeline history={ticket.history} />
            )}
          </div>

          {/* Real attachments — file upload, list, download, delete */}
          <TicketAttachments ticket={ticket} readOnly={isArchived} />
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {!isArchived && <TicketControls ticket={ticket} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this ticket?"
        description="This permanently removes the ticket, its comments, and its activity history. This cannot be undone."
        confirmLabel="Delete"
        danger
        isLoading={deleteTicket.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        title="Archive this ticket?"
        description={`Archive ${shortId(ticket.id)} — ${ticket.title}?\n\nCurrent status: ${ticket.status.replace('_', ' ')}. The ticket will become read-only and move to Archived Work Items. Comments, attachments, and history will be preserved, and an administrator can restore it later.`}
        confirmLabel="Move to Archived"
        isLoading={archiveTicket.isPending}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={handleArchive}
      />
      <ConfirmDialog
        open={restoreConfirmOpen}
        title="Restore this ticket?"
        description="This ticket will return to active work. Its previous workflow status will be retained, along with its comments, attachments, and history."
        confirmLabel="Restore to active work"
        isLoading={restoreTicket.isPending}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={handleRestore}
      />
    </div>
  );
}
