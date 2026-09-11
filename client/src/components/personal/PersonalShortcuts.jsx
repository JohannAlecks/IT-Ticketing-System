import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePersonal, usePersonalMutation } from '../../hooks/usePersonal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
function ShortcutLinks({ onClose }) {
  const query = usePersonal('shortcuts');
  const rows = query.isError ? [] : (query.data?.shortcuts || []).filter((r) => r.available && r.path).slice(0, 8).sort((a, b) => a.position - b.position);
  if (!rows.length) return null;
  return <section aria-label="Personal shortcuts" className="pt-4"><p className="eyebrow px-3 pb-2">Shortcuts</p>{rows.map((row) => <NavLink key={row.id} to={row.path} onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><Star className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{row.label}</span></NavLink>)}</section>;
}
export function ShortcutSidebar(props) {
  const { user, role } = useAuth();
  return user?.id ? <ShortcutLinks key={`${user.id}:${role}`} {...props} /> : null;
}
function Management() {
  const query = usePersonal('shortcuts');
  const views = usePersonal('views');
  const create = usePersonalMutation('createShortcut');
  const update = usePersonalMutation('updateShortcut');
  const remove = usePersonalMutation('deleteShortcut');
  const reorder = usePersonalMutation('reorder');
  const removeView = usePersonalMutation('deleteView');
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const [edit, setEdit] = useState(null);
  const [message, setMessage] = useState(null);
  const [confirmView, setConfirmView] = useState(null);
  const rows = query.data?.shortcuts || [];
  const busy = [create, update, remove, reorder, removeView].some((m) => m.isPending);
  const options = [...(query.data?.routes || []).map((r) => ({ value: `route:${r.key}`, label: r.label })), ...(views.data?.views || []).filter((v) => v.available).map((v) => ({ value: `view:${v.id}`, label: v.name }))];
  async function run(fn) { setMessage(null); try { await fn(); setMessage({ text: 'Personal shortcuts saved.' }); } catch (e) { setMessage({ error: true, text: e.response?.data?.message || 'Could not save. Entries are preserved. Refresh and retry.' }); } }
  const move = (index, delta) => run(() => { const ordered = [...rows]; [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]]; return reorder.mutateAsync({ items: ordered.map(({ id, version }) => ({ id, version })) }); });
  return <section className="card space-y-4 p-5 lg:col-span-2" aria-labelledby="personal-shortcuts-heading">
    <h2 id="personal-shortcuts-heading" className="font-semibold text-slate-900">Personal Shortcuts</h2>
    <p className="text-sm text-slate-600">{rows.length}/8 shortcuts. Only pages permitted by your current role are offered. Unavailable items remain removable and count toward the limit.</p>
    {query.isLoading && <p role="status">Loading shortcuts…</p>}
    {(query.isError || views.isError) && <p role="alert">Preferences could not be refreshed. <Button variant="secondary" onClick={() => { query.refetch(); views.refetch(); }}>Retry preferences</Button></p>}
    {query.data && !query.isError && <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
        const [kind, id] = target.split(':');
        await create.mutateAsync({ label, ...(kind === 'route' ? { targetType: 'ROUTE', routeKey: id } : { targetType: 'SAVED_VIEW', savedViewId: id }) }); setLabel(''); setTarget('');
      }); }}>
        <Select label="Shortcut destination" value={target} onChange={(e) => { setTarget(e.target.value); setLabel((options.find((o) => o.value === e.target.value)?.label || '').slice(0, 40)); }} disabled={busy || rows.length >= 8} required><option value="">Choose an authorized destination</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        <Input id="shortcut-label" label="Shortcut label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy || rows.length >= 8} required />
        <Button type="submit" disabled={busy || rows.length >= 8 || !target || !label.trim()}>Add shortcut</Button>
      </form>
      {!rows.length && <p className="text-sm text-slate-500">No shortcuts yet. Add a page or a saved ticket view.</p>}
      <ol className="space-y-3">{rows.map((row, index) => <li key={row.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="font-medium text-slate-800">{row.label}</p>{!row.available && <p className="text-sm text-slate-500">{row.reason || 'Unavailable for your current role.'}</p>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy || index === 0} aria-label={`Move ${row.label} up`} onClick={() => move(index, -1)}>Move Up</Button><Button size="sm" variant="secondary" disabled={busy || index === rows.length - 1} aria-label={`Move ${row.label} down`} onClick={() => move(index, 1)}>Move Down</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => setEdit({ ...row })}>Rename {row.label}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => remove.mutateAsync({ id: row.id, version: row.version }))}>Remove {row.label}</Button></div>
        {edit?.id === row.id && <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await update.mutateAsync({ id: edit.id, version: edit.version, label: edit.label }); setEdit(null); }); }}><Input id={`shortcut-rename-${row.id}`} label="New shortcut label" maxLength={40} required value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /><Button type="submit" disabled={busy}>Save shortcut label</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel rename</Button></form>}
      </li>)}</ol>
    </>}
    {(views.data?.views || []).filter((v) => !v.available).map((v) => <div key={v.id} className="text-sm text-slate-600">Unavailable saved view: {v.name}. <Button disabled={busy} variant="secondary" onClick={() => setConfirmView(v)}>Remove unavailable view</Button></div>)}
    {confirmView && <div role="alertdialog" aria-label="Remove unavailable saved view" className="space-y-2"><p>Delete {confirmView.name} and its shortcuts? Tickets remain unchanged.</p><Button disabled={busy} onClick={() => run(async () => { await removeView.mutateAsync({ id: confirmView.id, version: confirmView.version }); setConfirmView(null); })}>Confirm removal</Button><Button variant="secondary" onClick={() => setConfirmView(null)}>Cancel removal</Button></div>}
    {busy && <p role="status">Saving preferences…</p>}
    {message && <p role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </section>;
}
export default function PersonalShortcuts() {
  const { user, role } = useAuth();
  return user?.id ? <Management key={`${user.id}:${role}`} /> : null;
}
