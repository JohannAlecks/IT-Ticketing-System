import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCsatReport } from '../../hooks/useSatisfaction';
import Button from '../ui/Button';
import { formatDateTime, shortId } from '../../utils/format';

export function CsatMetrics({ data }) {
  return <div className="text-sm text-slate-700"><p className="text-lg font-semibold">{data.responses ? `${data.average} / 5` : 'Not enough feedback'}</p><p>{data.responses} responses</p></div>;
}
function ReportContent({ filters, summary, role }) {
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const allowedFilters = Object.fromEntries(['from', 'to', ...(role === 'ADMIN' ? ['agentId', 'department'] : [])].filter((key) => filters[key]).map((key) => [key, filters[key]]));
  const query = useCsatReport({ ...allowedFilters, ...(rating ? { rating: Number(rating) } : {}), page, limit: 10 }, summary);
  return <section className="card space-y-3 p-5" aria-label={role === 'ADMIN' ? 'Service-wide CSAT' : 'My CSAT'}>
    <h2 className="font-semibold text-slate-900">{role === 'ADMIN' ? 'Service-wide satisfaction' : 'My support satisfaction'}</h2>
    <p className="text-xs text-slate-500">{summary ? 'Last 30 days by submission date.' : 'Uses the date, Agent, and department filters above; other ticket filters do not apply. Attribution and department are captured at resolution.'}</p>
    {!summary && <label className="block text-sm text-slate-700">Satisfaction rating <select className="input ml-2" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }}><option value="">All ratings</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>}
    {query.isLoading ? <p role="status">Loading satisfaction…</p> : query.isError ? <div role="alert">Satisfaction could not be loaded. <Button onClick={() => query.refetch()}>Retry</Button></div> : query.data && <>
      <CsatMetrics data={query.data} />
      {!summary && <>
        <ul className="flex flex-wrap gap-4 text-sm text-slate-700" aria-label="Rating distribution">{[1, 2, 3, 4, 5].map((n) => <li key={n}>{n} / 5: {query.data.distribution[n] || 0}</li>)}</ul>
        {role === 'ADMIN' && <details className="text-sm text-slate-700"><summary>Daily satisfaction trend (UTC)</summary>{query.data.trend?.length ? <ul>{query.data.trend.map((point) => <li key={point.day}>{point.day}: {Number(point.average).toFixed(2)} / 5 · {point.responses} responses</li>)}</ul> : <p>Not enough feedback</p>}</details>}
        <p className="text-xs text-slate-500">{query.data.responseRateNote}</p>
        <div className="overflow-x-auto" role="region" aria-label="Satisfaction feedback table" tabIndex={0}><table className="w-full text-left text-sm text-slate-700"><caption className="sr-only">Recent satisfaction feedback</caption><thead><tr><th scope="col" className="p-2">Ticket / cycle</th><th scope="col" className="p-2">Submitted</th>{role === 'ADMIN' && <th scope="col" className="p-2">Attributed Agent / department</th>}<th scope="col" className="p-2">Rating</th><th scope="col" className="p-2">Feedback</th></tr></thead><tbody>{query.data.feedback?.map((item) => <tr key={item.id} className="border-t border-slate-200"><td className="p-2">{shortId(item.cycle.ticketId)} / {item.cycle.number}</td><td className="p-2">{formatDateTime(item.submittedAt)}</td>{role === 'ADMIN' && <td className="p-2">{item.cycle.assignedAgent?.name || 'Unattributed'} / {item.cycle.departmentSnapshot || 'Not specified'}</td>}<td className="p-2">{item.rating} / 5</td><td className="max-w-md whitespace-pre-wrap break-words p-2">{item.comment || 'No written feedback'}</td></tr>)}</tbody></table></div>
        {query.data.pagination.totalPages > 1 && <div className="flex items-center gap-3"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous feedback</Button><span>Page {page}</span><Button disabled={page >= query.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next feedback</Button></div>}
      </>}
    </>}
  </section>;
}
export default function CsatReport({ filters = {}, summary = false }) {
  const { user, role } = useAuth();
  if (!user?.id || !['ADMIN', 'AGENT'].includes(role)) return null;
  return <ReportContent key={`${user.id}:${role}:${JSON.stringify(filters)}`} filters={filters} summary={summary} role={role} />;
}
