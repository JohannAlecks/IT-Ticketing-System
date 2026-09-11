import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWatching, useSetWatching } from '../../hooks/useWatching';
import Button from '../ui/Button';
function Control({ ticket }) {
  const query = useWatching(ticket.id); const mutation = useSetWatching(ticket.id);
  const [message, setMessage] = useState(null); const pending = useRef(false);
  const inaccessible = [401, 403, 404].includes(query.error?.response?.status);
  if (inaccessible) return null;
  const state = query.data?.isWatching;
  const save = async () => {
    if (pending.current || mutation.isPending || state === undefined) return;
    pending.current = true; setMessage(null);
    try { await mutation.mutateAsync(!state); setMessage({ text: state ? 'Stopped watching this ticket.' : 'Watching this ticket.' }); }
    catch { setMessage({ error: true, text: 'Watching state could not be saved. Refresh and try again.' }); }
    finally { pending.current = false; }
  };
  return <section aria-label="Ticket watching" className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
    <p className="mb-2 text-sm text-slate-600">Receive in-app notifications about future public updates. Watching does not grant assignment or edit access.</p>
    {(query.isLoading || query.isPending) && <p role="status">Loading watching state…</p>}
    {query.isError && <p role="alert">Watching state could not be loaded. <Button variant="secondary" onClick={() => query.refetch()}>Retry watching state</Button></p>}
    {state !== undefined && (!ticket.archivedAt || state) && <Button variant="secondary" disabled={mutation.isPending || query.isFetching} onClick={save}>{state ? 'Stop watching' : 'Watch ticket'}</Button>}
    {ticket.archivedAt && state === false && <p className="text-sm text-slate-500">Archived tickets cannot gain new watchers.</p>}
    {mutation.isPending && <p role="status">Saving watching state…</p>}
    {message && <p role={message.error ? 'alert' : 'status'} className="mt-2 text-sm text-slate-700">{message.text}</p>}
  </section>;
}
export default function TicketWatching({ ticket }) {
  const { user, role } = useAuth();
  return user?.id && ticket?.id ? <Control key={`${user.id}:${role}:${ticket.id}`} ticket={ticket} /> : null;
}
