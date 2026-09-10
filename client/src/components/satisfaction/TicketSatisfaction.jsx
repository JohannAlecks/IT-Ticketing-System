import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSatisfaction, useSaveSatisfaction } from '../../hooks/useSatisfaction';
import Button from '../ui/Button';
import { formatDateTime } from '../../utils/format';

export const RATING_LABELS = ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'];

export function FeedbackCycle({ cycle, ticketId, onReload }) {
  const [rating, setRating] = useState(cycle.feedback?.rating || 0);
  const [comment, setComment] = useState(cycle.feedback?.comment || '');
  // Keep the version that this form was opened with. Polling must never silently
  // upgrade a stale draft to the newest server version.
  const [editToken, setEditToken] = useState(cycle.editToken);
  const [saved, setSaved] = useState(cycle.feedback);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const mutation = useSaveSatisfaction(ticketId, cycle.id);
  // Refresh the saved-value display independently of the user's draft/token.
  const displayed = (cycle.feedback?.version || 0) > (saved?.version || 0) ? cycle.feedback : saved || cycle.feedback;
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess(false);
    try {
      const result = await mutation.mutateAsync({ payload: { rating, comment }, token: editToken, update: Boolean(saved) });
      setSaved(result.feedback); setEditToken(result.editToken); setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Feedback could not be saved. Your entries are preserved.');
    }
  }
  return <article className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="font-semibold text-slate-800">Resolution cycle {cycle.number}</h3>
    <p className="text-xs text-slate-500">Resolved {formatDateTime(cycle.resolvedAt)} · Feedback deadline {formatDateTime(cycle.expiresAt)}</p>
    {displayed && <div className="text-sm text-slate-700"><p>Saved rating: {displayed.rating} / 5 — {RATING_LABELS[displayed.rating - 1]}</p>{displayed.comment && <p className="mt-1 whitespace-pre-wrap break-words">{displayed.comment}</p>}</div>}
    {cycle.state === 'HISTORICAL' && <p className="text-sm text-slate-500">Previous-cycle feedback is read-only.</p>}
    {cycle.state === 'EXPIRED' && <p className="text-sm text-slate-500">The 14-day feedback period has ended.</p>}
    {cycle.canWrite && <form onSubmit={submit} className="space-y-3">
      <fieldset disabled={mutation.isPending} className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Rate your support experience</legend>
        {RATING_LABELS.map((label, i) => <label key={label} className="csat-rating flex w-fit items-center gap-2 rounded px-2 py-1 text-sm text-slate-700">
          <input type="radio" name={`rating-${cycle.id}`} value={i + 1} required checked={rating === i + 1} onChange={() => setRating(i + 1)} />{i + 1} — {label}
        </label>)}
      </fieldset>
      <label className="block text-sm text-slate-700" htmlFor={`feedback-${cycle.id}`}>Optional written feedback</label>
      <textarea id={`feedback-${cycle.id}`} className="input min-h-24 w-full" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} disabled={mutation.isPending} aria-describedby={`help-${cycle.id}`} />
      <p id={`help-${cycle.id}`} className="text-xs text-slate-500">{comment.length}/1,000 characters. Do not include passwords or sensitive information. Feedback is visible to authorized support staff.</p>
      <Button type="submit" disabled={!rating || mutation.isPending} isLoading={mutation.isPending}>{saved ? 'Update feedback' : 'Submit feedback'}</Button>
    </form>}
    {error && <div role="alert" className="text-sm text-red-700"><p>{error}</p><Button variant="secondary" onClick={onReload}>Reload feedback and discard draft</Button></div>}
    {success && <p role="status" className="text-sm text-emerald-700">Feedback saved.</p>}
  </article>;
}

function TicketFeedback({ ticket }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const query = useSatisfaction(ticket, page);
  if (query.isLoading) return <section className="card p-5" role="status">Loading support feedback…</section>;
  if (query.error?.response?.status === 404) return null;
  if (query.isError) return <section className="card p-5" role="alert">Feedback could not be loaded. <Button onClick={() => query.refetch()}>Retry</Button></section>;
  const cycles = query.data?.cycles || [];
  if (!cycles.length && !['RESOLVED', 'CLOSED'].includes(ticket.status)) return null;
  return <section className="card space-y-3 p-5" aria-labelledby="csat-heading">
    <h2 id="csat-heading" className="text-base font-semibold text-slate-900">Support satisfaction</h2>
    {!cycles.length && <p className="text-sm text-slate-500">Feedback is unavailable for this earlier completion. No historical resolution date is inferred.</p>}
    {cycles.map((cycle) => <FeedbackCycle key={`${cycle.id}:${revision}`} cycle={cycle} ticketId={ticket.id} onReload={async () => { await query.refetch(); setRevision((n) => n + 1); }} />)}
    {query.data?.pagination?.totalPages > 1 && <div className="flex items-center gap-3"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous cycles</Button><span>Page {page}</span><Button disabled={page >= query.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Older cycles</Button></div>}
  </section>;
}
export default function TicketSatisfaction({ ticket }) {
  const { user, role } = useAuth();
  return user?.id ? <TicketFeedback key={`${user.id}:${role}:${ticket.id}`} ticket={ticket} /> : null;
}
