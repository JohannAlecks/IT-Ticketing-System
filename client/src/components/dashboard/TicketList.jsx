import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PriorityBadge from '../tickets/PriorityBadge';
import StatusBadge from '../tickets/StatusBadge';
import { formatDateTime } from '../../utils/format';
import { DashboardEmptyState } from './DashboardStates';

function ticketDetails(ticket) {
  const details = [];
  if (ticket.assignedTo?.name) details.push(`Assigned to ${ticket.assignedTo.name}`);
  if (ticket.status === 'CLOSED' && ticket.closedAt) details.push(`Closed ${formatDateTime(ticket.closedAt)}`);
  else if (ticket.updatedAt) details.push(`Updated ${formatDateTime(ticket.updatedAt)}`);
  else if (ticket.createdAt) details.push(`Created ${formatDateTime(ticket.createdAt)}`);
  return details.join(' · ');
}

export default function TicketList({
  id,
  title,
  description,
  tickets,
  linkTo,
  linkLabel = 'View all',
  emptyTitle = 'No tickets here',
  emptyDescription = 'There are no tickets to show in this list.',
  emptyAction,
}) {
  const rows = Array.isArray(tickets) ? tickets : [];
  const headingId = id || undefined;

  return (
    <section className="card min-w-0 p-5" aria-labelledby={headingId} aria-label={headingId ? undefined : title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {linkTo && <Link to={linkTo} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2">{linkLabel} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
      </div>
      {rows.length === 0 ? (
        <DashboardEmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label={`${title} tickets`}>
          {rows.map((ticket, index) => {
            const titleText = ticket.title || 'Untitled ticket';
            const details = ticketDetails(ticket);
            return (
              <li key={ticket.id || `${titleText}-${index}`}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  aria-label={`Open ticket ${titleText}`}
                  className="group flex min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-brand-700">{titleText}</span>
                    {details && <span className="mt-0.5 block truncate text-xs text-slate-500">{details}</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {ticket.status && <StatusBadge status={ticket.status} />}
                    {ticket.priority && <PriorityBadge priority={ticket.priority} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
