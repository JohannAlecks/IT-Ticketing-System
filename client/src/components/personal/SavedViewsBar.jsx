import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePersonal, usePersonalMutation } from '../../hooks/usePersonal';
import { savedFilters, sameFilters, scopeLabel } from './savedFilters';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
function Controls({ filters, scope, active, onSaved }) {
  const query = usePersonal('views');
  const create = usePersonalMutation('createView');
  const update = usePersonalMutation('updateView');
  const remove = usePersonalMutation('deleteView');
  const shortcut = usePersonalMutation('createShortcut');
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [renameVersion, setRenameVersion] = useState(null);
  const busy = [create, update, remove, shortcut].some((m) => m.isPending);
  const dirty = active && (!sameFilters(filters, active.filters, scope) || Boolean(filters.search));
  async function run(fn) {
    setMessage(null);
    try { await fn(); setMessage({ text: 'Preference saved.' }); }
    catch (error) { setMessage({ error: true, text: error.response?.data?.message || 'Could not save. Your filters and entries are preserved. Retry when ready.' }); }
  }
  const openName = (mode) => { setEditing(mode); setName(mode === 'rename' ? active.name : ''); setRenameVersion(active?.version); setMessage(null); };
  return <section className="card space-y-3 p-4" aria-label="Saved ticket views">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1"><Select label="Saved views" value={active?.id || ''} disabled={busy} onChange={(e) => { if (e.target.value) navigate(`/saved-views/${encodeURIComponent(e.target.value)}`); }}>
        <option value="">Choose a saved view</option>
        {(query.data?.views || []).filter((v) => v.available).map((v) => <option key={v.id} value={v.id}>{v.name} — {scopeLabel(v.scope)}</option>)}
      </Select></div>
      <Button variant="secondary" disabled={busy || !query.data || query.data.views.length >= 20} onClick={() => openName('create')}>{active ? 'Save as new' : 'Save current view'}</Button>
      {active && <>
        <Button variant="secondary" disabled={busy || !dirty} onClick={() => run(async () => { const result = await update.mutateAsync({ id: active.id, version: active.version, filters: savedFilters(filters, scope) }); if (alive.current) onSaved?.(result, true); })}>Update saved view</Button>
        <Button variant="secondary" disabled={busy} onClick={() => openName('rename')}>Rename view</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setConfirmation(active.version)}>Delete view</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => shortcut.mutateAsync({ targetType: 'SAVED_VIEW', savedViewId: active.id, label: active.name.slice(0, 40) }))}>Add to shortcuts</Button>
      </>}
    </div>
    <p className="text-xs text-slate-500">Up to 20 personal views. Search text stays temporary and is never saved. Scope: {scopeLabel(scope)}.</p>
    {active && <p role="status" className="text-sm text-slate-700">Active view: {active.name}{dirty ? ' — Unsaved filter changes' : ''}</p>}
    {query.isLoading && <p role="status">Loading saved views…</p>}
    {query.isError && <p role="alert">Saved views could not be loaded. <Button variant="secondary" onClick={() => query.refetch()}>Retry saved views</Button></p>}
    {query.data?.views.length === 0 && <p className="text-sm text-slate-500">No saved views yet.</p>}
    {editing && <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
      const result = editing === 'rename' ? await update.mutateAsync({ id: active.id, version: renameVersion, name }) : await create.mutateAsync({ name, scope, filters: savedFilters(filters, scope) });
      if (!alive.current) return;
      setEditing(null); if (editing === 'rename') onSaved?.(result, false); else navigate(result.path);
    }); }}>
      <Input id="saved-view-name" label="View name" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
      <Button type="submit" disabled={busy || !name.trim()}>Save view name</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
    </form>}
    {confirmation && <div role="alertdialog" aria-label="Delete saved view confirmation" aria-describedby="delete-view-description" className="space-y-2 rounded-xl border border-slate-300 p-3">
      <p id="delete-view-description">Delete this saved view? Its personal shortcuts will also be removed. Tickets are not changed.</p>
      <Button disabled={busy} onClick={() => run(async () => { await remove.mutateAsync({ id: active.id, version: confirmation }); if (alive.current) navigate(scope === 'ARCHIVED' ? '/tickets/archived' : '/tickets'); })}>Confirm delete view</Button>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirmation(false)}>Keep view</Button>
    </div>}
    {busy && <p role="status">Saving preference…</p>}
    {message && <p role={message.error ? 'alert' : 'status'} className="text-sm text-slate-700">{message.text}</p>}
  </section>;
}
export default function SavedViewsBar(props) {
  const { user, role } = useAuth();
  const scope = props.scope || (role === 'USER' ? 'MY_TICKETS' : 'ALL_AUTHORIZED');
  return user?.id ? <Controls key={`${user.id}:${role}:${props.active?.id || scope}`} {...props} scope={scope} /> : null;
}
