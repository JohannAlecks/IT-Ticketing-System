import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDepartments, useDepartmentMutation } from '../hooks/useDepartments';
import DepartmentPicker from '../components/settings/DepartmentPicker';
import AccountDialog from '../components/ui/AccountDialog';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';

function DepartmentDialog({ selected, onClose }) {
  const { action, row } = selected; const [page, setPage] = useState(1);
  const members = useDepartments('members', { page, limit: 10 }, row?.id);
  const mutation = useDepartmentMutation(action);
  const [name, setName] = useState(row?.name || ''); const [description, setDescription] = useState(row?.description || '');
  const [target, setTarget] = useState(null); const [error, setError] = useState(null);
  const current = members.data?.department; const busy = mutation.isPending;
  // Capture the reviewed source version: membership changes invalidate it.
  const version = row?.version;
  const save = async (event) => { event.preventDefault(); if (busy) return; setError(null);
    try {
      const body = action === 'create' ? { name, description: description || null }
        : action === 'update' ? { id: row.id, version, name, description: description || null }
        : action === 'status' ? { id: row.id, version, isActive: !row.isActive }
        : { id: row.id, version, targetId: target.id, targetVersion: target.version };
      await mutation.mutateAsync(body); onClose();
    } catch { setError('Change not completed or could not be refreshed. A department or its membership may have changed. Close, refresh and try again.'); }
  };
  const ready = action === 'create' || (current && !members.isError && current.version === version);
  return <AccountDialog title={action === 'create' ? 'Create department' : `${({ update: 'Edit', status: row.isActive ? 'Deactivate' : 'Activate', merge: 'Merge', members: 'Members of' })[action]} ${row.name}`} onClose={onClose} busy={busy}>
    {row && <section className="space-y-2 mb-5"><h3 className="font-semibold">Affected current members</h3>
      {members.isPending && <p role="status">Loading members…</p>}{members.isError && <p role="alert">Members unavailable. <Button onClick={() => members.refetch()}>Retry</Button></p>}
      {members.data && <><p>{members.data.pagination.total} members. Historical SLA and satisfaction snapshots will not change.</p><ul className="text-sm space-y-1">{members.data.users.map((u) => <li key={u.id}>{u.name} · {u.role} · {u.isActive ? 'Active' : 'Inactive'}</li>)}</ul><div className="flex gap-2"><Button disabled={page <= 1 || busy} variant="secondary" onClick={() => setPage(page - 1)}>Previous members</Button><Button disabled={page >= members.data.pagination.totalPages || busy} variant="secondary" onClick={() => setPage(page + 1)}>Next members</Button></div></>}
      {current && current.version !== version && <p role="alert">Department changed since you opened it. Close and refresh before making a change.</p>}
    </section>}
    {action !== 'members' && <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      {(action === 'create' || action === 'update') && <><Input label="Department name" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /><Input label="Description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></>}
      {action === 'status' && <p>{row.isActive ? 'Existing members remain assigned and can see their department. New selection is blocked; no user account is deactivated.' : 'This department will become available for new selections.'}</p>}
      {action === 'merge' && <><DepartmentPicker label="Target department" value={target?.id} onChange={(id, option) => setTarget(option)} includeInactive allowEmpty={false} />{target && <p>Target: {target.name} · {target.memberCount} current members. {target.isActive === false ? 'Inactive targets cannot receive a merge.' : ''}</p>}<p>Current source members move to the active target. The source is deactivated; no historical record or legacy department string is rewritten.</p></>}
      <Button type="submit" disabled={!ready || busy || (action === 'merge' && (!target?.isActive || target.id === row.id))}>{action === 'create' ? 'Create department' : 'Confirm change'}</Button>
    </fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}</form>}
  </AccountDialog>;
}
function Directory() {
  const [url, setUrl] = useSearchParams(); const [selected, setSelected] = useState(null);
  const status = ['ACTIVE', 'INACTIVE', 'ALL'].includes(url.get('status')) ? url.get('status') : 'ACTIVE';
  const page = /^\d+$/.test(url.get('page') || '') ? Math.min(100000, Math.max(1, Number(url.get('page')))) : 1;
  const search = (url.get('search') || '').slice(0, 100); const query = useDepartments('list', { status, page, limit: 20, search });
  const change = (patch) => { const next = new URLSearchParams(url); Object.entries({ ...patch, page: patch.page || 1 }).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k)); setUrl(next); };
  return <div className="space-y-5 min-w-0"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="page-title">Departments</h1><p className="page-subtitle">Manage current membership without changing historical snapshots.</p></div><Button onClick={() => setSelected({ action: 'create' })}>Create department</Button></header>
    <div className="card p-4 grid gap-3 sm:grid-cols-2"><Input label="Search departments" maxLength={100} value={search} onChange={(e) => change({ search: e.target.value })} /><Select label="Department status" value={status} onChange={(e) => change({ status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All departments</option></Select></div>
    {query.isPending && <p role="status">Loading departments…</p>}{query.isError && <p role="alert">Department directory unavailable. <Button onClick={() => query.refetch()}>Retry</Button></p>}
    {query.data && <><div className="grid gap-3 md:grid-cols-2">{query.data.departments.map((row) => <article key={row.id} className="card p-4 space-y-3 min-w-0"><h2 className="font-semibold break-words">{row.name}</h2><p className="text-sm break-words">{row.description || 'No description'}</p><p className="text-sm">{row.isActive ? 'Active' : 'Inactive'} · {row.memberCount} members · {row.activeAgentCount} active Agents</p><Select label={`Actions for ${row.name}`} value="" onChange={(e) => e.target.value && setSelected({ row, action: e.target.value })}><option value="">Choose action</option><option value="members">View members</option><option value="update">Edit</option><option value="status">{row.isActive ? 'Deactivate' : 'Activate'}</option><option value="merge">Merge into another department</option></Select></article>)}</div>{!query.data.departments.length && <p>No matching departments.</p>}<nav aria-label="Department pagination" className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => change({ page: page - 1 })}>Previous</Button><span>{query.data.pagination.total} departments · Page {page}</span><Button variant="secondary" disabled={page >= query.data.pagination.totalPages} onClick={() => change({ page: page + 1 })}>Next</Button></nav></>}
    {selected && <DepartmentDialog key={`${selected.action}:${selected.row?.id}`} selected={selected} onClose={() => setSelected(null)} />}
  </div>;
}
export default function DepartmentsPage() { const { user, role } = useAuth(); return role === 'ADMIN' ? <Directory key={`${user.id}:${role}`} /> : <Navigate to="/dashboard" replace />; }
