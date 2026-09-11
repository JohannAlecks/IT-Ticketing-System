import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserDetails, useUpdateUserRole, useDeactivateUser, useReactivateUser } from '../../hooks/useUsers';
import { useAuth } from '../../context/AuthContext';
import { AccountFacts } from '../settings/AccountPanels';
import AccountDialog from '../ui/AccountDialog';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { formatDateTime } from '../../utils/format';
export default function UserDetails({ id, action = 'details', onClose }) {
  const query = useUserDetails(id); const { user: actor } = useAuth();
  const changeRole = useUpdateUserRole(); const deactivate = useDeactivateUser(); const reactivate = useReactivateUser();
  const [proposed, setProposed] = useState(''); const [error, setError] = useState(null); const [saving, setSaving] = useState(false);
  const busy = saving || changeRole.isPending || deactivate.isPending || reactivate.isPending;
  const data = query.data; const target = data?.user;
  const pending = useRef(false);
  const submit = async () => { if (pending.current || busy || !target || target.id === actor.id) return; pending.current = true; setSaving(true); setError(null); try {
    if (action === 'role') await changeRole.mutateAsync({ id, role: proposed });
    else await (target.isActive ? deactivate : reactivate).mutateAsync(id);
    onClose();
  } catch { setError('Account change was not completed. The account may have changed or a safety rule blocked it. Refresh and try again.'); } finally { pending.current = false; setSaving(false); } };
  return <AccountDialog title={action === 'role' ? 'Change account role' : action === 'status' ? 'Confirm account status change' : 'User details'} onClose={onClose} busy={busy}>
    {query.isPending && <p role="status">Loading current account…</p>}{query.isError && <p role="alert">Account details could not be loaded. <Button onClick={() => query.refetch()}>Retry account</Button></p>}
    {target && <div className="space-y-5"><h3 className="break-words text-lg font-semibold">{target.name}</h3><AccountFacts user={target} /><p className="text-sm">Department: {target.department || 'Not specified'}</p><p>Active assigned workload: <strong>{data.activeWorkload}</strong></p>
      {action === 'details' ? <>
        {data.sla && <p className="text-sm">Agent SLA: {data.sla.dueSoon} due soon · {data.sla.breached} breached</p>}
        {data.csat && <p className="text-sm">Agent CSAT: {data.csat.count ? `${Number(data.csat.average).toFixed(1)}/5 from ${data.csat.count} ratings` : 'No ratings yet'}</p>}
        <section><h3 className="mb-2 font-semibold">Recent ticket updates</h3><p className="text-xs text-slate-500">Ticket update times, not last login or user activity.</p><ul className="space-y-2">{data.recentTickets.map((ticket) => <li key={ticket.id} className="break-words text-sm"><Link className="text-brand-700 underline" to={`/tickets/${ticket.id}`} onClick={onClose}>{ticket.title}</Link> · {ticket.status} {ticket.archivedAt ? '· Archived' : ''}<p className="text-xs text-slate-500">{formatDateTime(ticket.updatedAt)}</p></li>)}</ul>{!data.recentTickets.length && <p className="text-sm text-slate-500">No recent tickets.</p>}</section>
        <section><h3 className="mb-2 font-semibold">Account lifecycle</h3><ul className="space-y-2 text-sm">{data.lifecycle.map((entry) => <li key={entry.id}>{({ 'user.created': 'Account created', 'user.role_changed': 'Role changed', 'user.deactivated': 'Deactivated', USER_REACTIVATED: 'Reactivated' })[entry.eventType]} · {formatDateTime(entry.createdAt)}</li>)}</ul>{!data.lifecycle.length && <p className="text-sm text-slate-500">No recorded lifecycle events.</p>}</section>
      </> : <>
        {action === 'role' ? <><Select label="Proposed role" value={proposed} disabled={busy} onChange={(e) => setProposed(e.target.value)}><option value="">Choose a role</option>{['USER', 'AGENT', 'ADMIN'].map((role) => <option key={role} disabled={role === target.role}>{role}</option>)}</Select><p className="text-sm">Current role: {target.role}. Proposed role: {proposed || 'Not selected'}.</p><p className="text-sm">USER sees their own tickets. AGENT handles assigned and unassigned work. ADMIN manages accounts and all authorized tickets. Moving staff to USER unassigns unresolved active tickets; history is preserved.</p></> : <p className="text-sm">{target.isActive ? 'Deactivation blocks sign-in and existing tokens immediately. Unresolved active assignments are removed; tickets, watchers, notifications, and history remain.' : 'Reactivation restores sign-in for verified accounts. Existing history remains; old assignments are not restored automatically.'}</p>}
        {target.id === actor.id && <p className="text-sm text-amber-700">Self-deactivation and self-demotion are blocked.</p>}
        <Button variant={action === 'status' && target.isActive ? 'danger' : 'primary'} disabled={busy || target.id === actor.id || (action === 'role' && (!proposed || proposed === target.role))} onClick={submit}>{action === 'role' ? 'Confirm role change' : target.isActive ? 'Deactivate account' : 'Reactivate account'}</Button>
      </>}
    </div>}{error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
  </AccountDialog>;
}
