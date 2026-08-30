import { Link } from 'react-router-dom';
import StatusBadge from '../tickets/StatusBadge';
import PriorityBadge from '../tickets/PriorityBadge';
import { categoryLabel } from '../../constants/ticketCategories';
import { formatDate } from '../../utils/format';

function referenceFor(id) {
  const value = String(id ?? '');
  return value ? `#${value.slice(0, 8)}` : '—';
}

function workBlockingFor(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}

function safeAgent(row) {
  return row?.assignedAgent?.name || 'Unassigned';
}

function safeDepartment(row) {
  if (typeof row?.requesterDepartment === 'string') return row.requesterDepartment;
  return row?.requesterDepartment?.name || row?.requesterDepartment?.label || '—';
}

function TicketReference({ row }) {
  if (!row?.id) return <span>—</span>;
  return <Link className="font-mono text-xs font-semibold text-brand-700 hover:text-brand-800" to={`/tickets/${row.id}`} title={`Ticket ${row.id}`}>{referenceFor(row.id)}</Link>;
}

function TicketTitle({ row }) {
  if (!row?.id) return <span>{row?.title || 'Untitled ticket'}</span>;
  return <Link className="font-semibold text-slate-900 hover:text-brand-700" to={`/tickets/${row.id}`}>{row?.title || 'Untitled ticket'}</Link>;
}

function Field({ label, children }) {
  return <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="text-right text-sm text-slate-800">{children}</dd></div>;
}

function TicketFields({ row, isAdmin }) {
  const workBlocking = workBlockingFor(row?.isWorkBlocking);
  return (
    <dl>
      <Field label="Ticket ID / reference"><TicketReference row={row} /></Field>
      <Field label="Title"><TicketTitle row={row} /></Field>
      <Field label="Status"><StatusBadge status={row?.status} /></Field>
      <Field label="Category">{categoryLabel(row?.category)}</Field>
      <Field label="Priority"><PriorityBadge priority={row?.priority} /></Field>
      <Field label="Work-blocking"><span className="font-semibold">{workBlocking ? 'Yes' : 'No'}</span></Field>
      <Field label="Created">{formatDate(row?.createdAt)}</Field>
      <Field label="Closed">{formatDate(row?.closedAt)}</Field>
      {isAdmin && <Field label="Requester department">{safeDepartment(row)}</Field>}
      {isAdmin && <Field label="Assigned agent">{safeAgent(row)}</Field>}
    </dl>
  );
}

export default function ReportsTable({ rows, isAdmin }) {
  const items = Array.isArray(rows) ? rows : [];
  return (
    <section className="space-y-3" aria-labelledby="reports-table-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="reports-table-heading" className="text-base font-semibold text-slate-900">Detailed report tickets</h2>
          <p className="mt-1 text-sm text-slate-500">Authorized ticket fields for the selected range and filters.</p>
        </div>
        <p className="text-xs text-slate-500">{items.length} row{items.length === 1 ? '' : 's'} on this page</p>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
        <table className="w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Detailed report tickets</caption>
          <thead className="bg-slate-50/95">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ticket ID / reference</th>
              <th scope="col" className="min-w-[190px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Title</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Work-blocking</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Closed</th>
              {isAdmin && <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requester department</th>}
              {isAdmin && <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Assigned agent</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((row) => {
              const workBlocking = workBlockingFor(row?.isWorkBlocking);
              return (
                <tr key={row?.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-4"><TicketReference row={row} /></td>
                  <td className="max-w-xs px-4 py-4"><TicketTitle row={row} /></td>
                  <td className="whitespace-nowrap px-4 py-4"><StatusBadge status={row?.status} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{categoryLabel(row?.category)}</td>
                  <td className="whitespace-nowrap px-4 py-4"><PriorityBadge priority={row?.priority} /></td>
                  <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">{workBlocking ? 'Yes' : 'No'}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(row?.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(row?.closedAt)}</td>
                  {isAdmin && <td className="whitespace-nowrap px-4 py-4 text-slate-600">{safeDepartment(row)}</td>}
                  {isAdmin && <td className="whitespace-nowrap px-4 py-4 text-slate-600">{safeAgent(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" aria-label="Detailed report ticket cards">
        {items.map((row) => <article key={row?.id} className="card p-4"><TicketFields row={row} isAdmin={isAdmin} /></article>)}
      </div>
    </section>
  );
}

