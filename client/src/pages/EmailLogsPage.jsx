import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEmailLogs } from '../hooks/useEmailLogs';
import AccountDialog from '../components/ui/AccountDialog';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { formatDateTime } from '../utils/format';

const statuses = { DISABLED: 'Disabled', UNKNOWN: 'Unknown', ACCEPTED: 'Accepted', FAILED: 'Failed' };
const explanations = {
  DISABLED: 'No provider request was made because email was disabled.',
  UNKNOWN: 'Submission is in progress or its outcome could not be confirmed. It may or may not have been accepted. No automatic retry.',
  ACCEPTED: 'The provider accepted the request. This is not proof of delivery.',
  FAILED: 'The provider explicitly rejected the request. This is not a bounce report.',
};
const errors = { EMAIL_DISABLED: 'Email disabled', NOT_CONFIRMED: 'Submission not confirmed', PROVIDER_REJECTED: 'Provider rejected request', TIMEOUT: 'Confirmation timed out', TRANSPORT_ERROR: 'Provider outcome unavailable', INVALID_RESPONSE: 'Unrecognized provider response' };
const providerLabel = (p) => p === 'RESEND' || p === 'resend' ? 'Resend' : 'Disabled';
function Details({ id, onClose }) {
  const query = useEmailLogs({}, id); const row = query.data;
  return <AccountDialog title="Email log details" onClose={onClose}>
    {query.isPending && <p role="status">Loading email metadata…</p>}
    {query.isError && <p role="alert">Email metadata unavailable. <Button onClick={() => query.refetch()}>Retry details</Button></p>}
    {row && <div className="space-y-4"><p>{explanations[row.status]}</p><dl className="grid gap-3 text-sm sm:grid-cols-2">
      {Object.entries({ 'Log ID': row.id, Type: 'Email verification', Recipient: row.recipientMasked, Provider: providerLabel(row.provider), Status: statuses[row.status], 'Submission attempts': row.attemptCount, 'Safe error category': errors[row.errorCategory] || 'None', Created: formatDateTime(row.createdAt), Updated: formatDateTime(row.updatedAt), Accepted: row.acceptedAt ? formatDateTime(row.acceptedAt) : 'Not confirmed', Failed: row.failedAt ? formatDateTime(row.failedAt) : 'Not recorded', 'Provider message ID': row.providerMessageId || 'Unavailable' }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="break-all">{value}</dd></div>)}
    </dl></div>}
    <p className="mt-4 text-sm text-slate-500">Message content is not stored. Retry from a log is unavailable. Delivery, bounce and complaint tracking are not configured.</p>
  </AccountDialog>;
}
function Logs() {
  const [filters, setFilters] = useState({ page: 1, limit: 20 });
  const [draftId, setDraftId] = useState(''); const [error, setError] = useState(null); const [selected, setSelected] = useState(null);
  const query = useEmailLogs(filters); const data = query.data;
  const change = (patch) => { setError(null); setFilters((f) => ({ ...f, ...patch, page: 1 })); };
  const search = (event) => {
    event.preventDefault(); const value = draftId.trim();
    if (value && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) { setError('Enter a valid log ID, not an email address or message text.'); return; }
    change({ id: value || undefined });
  };
  const invalidDates = filters.from && filters.to && filters.from > filters.to;
  return <div className="space-y-5 min-w-0">
    <header><p className="eyebrow">Administration</p><h1 className="page-title">Email logs</h1><p className="page-subtitle">Masked operational metadata. Accepted does not mean delivered.</p></header>
    {data?.provider === 'disabled' && <div role="status" className="card p-4 border border-amber-300"><h2 className="font-semibold">Email delivery is disabled</h2><p>No provider requests are made while disabled. Earlier log entries retain their recorded outcomes.</p></div>}
    <p className="text-sm text-slate-500">Delivery, bounce and complaint tracking are unavailable. Messages cannot be retried from logs because tokens and content are not stored.</p>
    {data && <section aria-label="Email status counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(statuses).map(([key, label]) => <div key={key} className="card p-4"><h2 className="text-sm">{label}</h2><p className="text-2xl font-semibold">{data.counts[key] || 0}</p></div>)}<p className="col-span-full text-xs text-slate-500">Counts match type, UTC dates and log ID, ignoring the status filter.</p></section>}
    <section className="card p-4 space-y-4" aria-label="Email log filters"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Select label="Email status" value={filters.status || ''} onChange={(e) => change({ status: e.target.value || undefined })}><option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Select label="Email type" value={filters.messageType || ''} onChange={(e) => change({ messageType: e.target.value || undefined })}><option value="">All types</option><option value="EMAIL_VERIFICATION">Email verification</option></Select>
      <Input label="Created from (UTC)" type="date" min="2000-01-01" max="2100-12-31" value={filters.from || ''} onChange={(e) => change({ from: e.target.value || undefined })} />
      <Input label="Created through (UTC)" type="date" min="2000-01-01" max="2100-12-31" value={filters.to || ''} onChange={(e) => change({ to: e.target.value || undefined })} />
    </div><form onSubmit={search} className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Input label="Exact log ID" maxLength={36} value={draftId} onChange={(e) => setDraftId(e.target.value)} /></div><Button type="submit">Find log</Button><Button type="button" variant="secondary" onClick={() => { setFilters({ page: 1, limit: 20 }); setDraftId(''); setError(null); }}>Clear filters</Button></form>
      {(error || invalidDates) && <p role="alert">{error || 'Start date must precede end date.'}</p>}
    </section>
    {query.isPending && <p role="status">Loading email logs…</p>}
    {query.isError && <p role="alert">Email logs could not be loaded. Check the filters and try again. <Button onClick={() => query.refetch()}>Retry logs</Button></p>}
    {data && <><div className="card overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Email submission outcomes; recipients are masked</caption><thead><tr>{['Recipient / type', 'Outcome', 'Provider', 'Created / updated', 'Details'].map((label) => <th scope="col" key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{data.logs.map((row) => <tr key={row.id} className="border-t border-slate-200"><td className="p-3 break-all">{row.recipientMasked}<p className="text-xs text-slate-500">Email verification</p></td><td className="p-3"><span className="font-semibold">{statuses[row.status]}</span><p className="text-xs text-slate-500">{errors[row.errorCategory] || 'Provider accepted only'}</p></td><td className="p-3">{providerLabel(row.provider)}</td><td className="p-3 text-xs">{formatDateTime(row.createdAt)}<p className="text-slate-500">Updated {formatDateTime(row.updatedAt)}</p></td><td className="p-3"><Button size="sm" variant="secondary" aria-label={`View email log ${row.id}`} onClick={() => setSelected(row.id)}>View</Button></td></tr>)}</tbody></table></div>
      {!data.logs.length && <p>No matching email logs. Only attempts made after this feature is enabled are recorded.</p>}
      <nav aria-label="Email log pagination" className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button><p>{data.pagination.total} logs · Page {filters.page}</p><Button variant="secondary" disabled={filters.page >= data.pagination.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Button><Button variant="secondary" onClick={() => query.refetch()}>Refresh logs</Button></nav></>}
    {selected && <Details key={selected} id={selected} onClose={() => setSelected(null)} />}
  </div>;
}
export default function EmailLogsPage() { const { user, role } = useAuth(); return role === 'ADMIN' && user?.id ? <Logs key={`${user.id}:${role}`} /> : <Navigate to="/dashboard" replace />; }
