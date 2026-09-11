import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useUsers, useUserSummary, useCreateUser } from '../hooks/useUsers';
import UserDetails from '../components/users/UserDetails';
import AccountDialog from '../components/ui/AccountDialog';
import { formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

const ROLE_OPTIONS = ['USER', 'AGENT', 'ADMIN'];

function CreateUserModal({ onClose }) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AGENT' });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    createUser.mutate(form, {
      onSuccess: onClose,
      onError: (err) => {
        const details = err.response?.data?.details;
        if (details) setErrors(Object.fromEntries(details.map((d) => [d.field, d.message])));
      },
    });
  };

  return (
    <AccountDialog title="Add a user" onClose={onClose} busy={createUser.isPending}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="Name" name="name" required value={form.name} onChange={handleChange} error={errors.name} />
          <Input label="Email" name="email" type="email" required value={form.email} onChange={handleChange} error={errors.email} />
          <Input label="Password" name="password" type="password" required value={form.password} onChange={handleChange} error={errors.password} />
          <Select label="Role" name="role" value={form.role} onChange={handleChange}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={createUser.isPending}>Create</Button>
          </div>
        </form>
    </AccountDialog>
  );
}

export function readUserFilters(url) {
  const oneOf = (key, allowed, fallback) => allowed.includes(url.get(key)) ? url.get(key) : fallback;
  return { status: oneOf('status', ['ACTIVE', 'INACTIVE', 'ALL'], 'ACTIVE'), role: oneOf('role', ROLE_OPTIONS, undefined),
    search: (url.get('search') || '').slice(0, 100), department: (url.get('department') || '').slice(0, 100) || undefined,
    verification: oneOf('verification', ['VERIFIED', 'UNVERIFIED'], undefined), missingDepartment: oneOf('missingDepartment', ['true'], undefined),
    sort: oneOf('sort', ['name', 'newest', 'oldest', 'role', 'department'], 'newest'),
    page: /^[0-9]+$/.test(url.get('page') || '') ? Math.min(100000, Math.max(1, Number(url.get('page')))) : 1, limit: 20 };
}
function UsersDirectory() {
  const [url, setUrl] = useSearchParams(); const location = useLocation(); const filters = readUserFilters(url);
  const query = useUsers(filters); const summary = useUserSummary(); const { user: currentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false); const [selected, setSelected] = useState(null);
  const update = (patch, reset = false) => { const next = reset ? new URLSearchParams() : new URLSearchParams(url); Object.entries({ ...patch, page: patch.page || 1 }).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); setUrl(next); };
  useEffect(() => { if (/^#user-[a-f0-9-]{36}$/i.test(location.hash)) setSelected({ id: location.hash.slice(6), action: 'details' }); }, [location.hash]);
  const users = query.data?.users || []; const pagination = query.data?.pagination;
  const metrics = [['total', 'Total accounts', { status: 'ALL' }], ['active', 'Active accounts', { status: 'ACTIVE' }], ['inactive', 'Inactive accounts', { status: 'INACTIVE' }], ['admins', 'Admins', { status: 'ALL', role: 'ADMIN' }], ['agents', 'Agents', { status: 'ALL', role: 'AGENT' }], ['users', 'Requesters', { status: 'ALL', role: 'USER' }], ['unverified', 'Unverified accounts', { status: 'ALL', verification: 'UNVERIFIED' }], ['withoutDepartment', 'Without department', { status: 'ALL', missingDepartment: 'true' }]];
  const actions = (account) => <select aria-label={`Actions for ${account.name}`} className="input min-w-32" value="" onChange={(e) => setSelected({ id: account.id, action: e.target.value })}><option value="">Actions…</option><option value="details">View details</option><option value="role" disabled={account.id === currentUser.id}>Change role</option><option value="status" disabled={account.id === currentUser.id}>{account.isActive ? 'Deactivate account' : 'Reactivate account'}</option></select>;
  return <div className="min-w-0 space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="page-title">Users</h1><p className="page-subtitle">Account health, access and assigned work. Admin access only.</p></div><Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add User</Button></header>
    {summary.isPending && <p role="status">Loading account metrics…</p>}{summary.isError && <ErrorState message="Couldn't load account metrics." onRetry={() => summary.refetch()} />}
    {summary.data && <section aria-label="Account metrics" className="grid grid-cols-2 gap-2 lg:grid-cols-4">{metrics.map(([key, label, patch]) => { const active = Object.entries(patch).every(([field, value]) => filters[field] === value) && ['role', 'verification', 'missingDepartment'].every((field) => !filters[field] || patch[field] === filters[field]); return <button key={key} onClick={() => update(patch, true)} aria-pressed={active} className={`card min-w-0 p-3 text-left ${active ? 'ring-2 ring-brand-600' : ''}`}><span className="block text-xs font-medium text-slate-500">{label}</span><span className="mt-1 block text-xl font-semibold">{summary.data[key]}</span></button>; })}</section>}
    <section aria-label="User filters" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Input label="Search name or email" type="search" maxLength={100} value={filters.search} onChange={(e) => update({ search: e.target.value })} />
      <Select label="Account status" value={filters.status} onChange={(e) => update({ status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All users</option></Select>
      <Select label="Role filter" value={filters.role || ''} onChange={(e) => update({ role: e.target.value })}><option value="">All roles</option>{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</Select>
      <Input label="Department filter (exact)" maxLength={100} value={filters.department || ''} onChange={(e) => update({ department: e.target.value, missingDepartment: undefined })} />
      <Select label="Email verification" value={filters.verification || ''} onChange={(e) => update({ verification: e.target.value })}><option value="">Any verification</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Unverified</option></Select>
      <Select label="Sort accounts" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>{[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name A–Z'], ['role', 'Role'], ['department', 'Department A–Z']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.missingDepartment === 'true'} onChange={(e) => update({ missingDepartment: e.target.checked ? 'true' : undefined, department: undefined })} />Without department</label>
      <Button variant="secondary" onClick={() => update({ status: 'ACTIVE' }, true)}>Clear filters</Button>
    </section>
    {query.isPending && <div role="status"><Spinner />Loading users…</div>}{query.isError && <ErrorState message="Couldn't load users." onRetry={() => query.refetch()} />}
    {query.data && !users.length && <div className="card p-8 text-center"><h2 className="font-semibold">No matching accounts</h2><p className="text-sm text-slate-500">Try changing the search or filters.</p></div>}
    {!!users.length && <>
      <div className="card hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><caption className="sr-only">Admin account directory</caption><thead className="bg-slate-50"><tr>{[['name', 'User'], [null, 'Email'], ['role', 'Role'], ['department', 'Department'], [null, 'Verification'], [null, 'Status'], [null, 'Active workload'], ['newest', 'Joined'], [null, 'Actions']].map(([sort, label]) => <th key={label} scope="col" className="p-3 font-semibold" aria-sort={sort && (filters.sort === sort || (sort === 'newest' && filters.sort === 'oldest')) ? (filters.sort === 'newest' ? 'descending' : 'ascending') : undefined}>{sort ? <button onClick={() => update({ sort: sort === 'newest' && filters.sort === 'newest' ? 'oldest' : sort })}>{label}{filters.sort === sort || (sort === 'newest' && filters.sort === 'oldest') ? (filters.sort === 'newest' ? ' ↓' : ' ↑') : ''}</button> : label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{users.map((account) => <tr key={account.id} id={`user-${account.id}`} tabIndex={-1}><th scope="row" className="p-3"><button className="text-brand-700 underline" onClick={() => setSelected({ id: account.id, action: 'details' })}>{account.name}</button></th><td className="max-w-48 break-words p-3">{account.email}</td><td className="p-3">{account.role}</td><td className="p-3">{account.department || 'Not specified'}</td><td className="p-3">{account.emailVerified ? 'Verified' : 'Unverified'}</td><td className="p-3">{account.isActive ? 'Active' : 'Inactive'}</td><td className="p-3">{account.activeWorkload}</td><td className="whitespace-nowrap p-3">{formatDate(account.createdAt)}</td><td className="p-3">{actions(account)}</td></tr>)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{users.map((account) => <article key={account.id} className="card space-y-3 p-4"><h2 className="break-words font-semibold">{account.name}</h2><p className="break-all text-sm text-slate-500">{account.email}</p><p className="text-sm">{account.role} · {account.isActive ? 'Active' : 'Inactive'} · {account.emailVerified ? 'Verified' : 'Unverified'}</p><p className="text-sm">Department: {account.department || 'Not specified'}<br />Active workload: {account.activeWorkload} · Joined {formatDate(account.createdAt)}</p>{actions(account)}</article>)}</div>
    </>}
    {pagination && <nav aria-label="User pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{users.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–{users.length ? Math.min(pagination.page * pagination.limit, pagination.total) : 0} of {pagination.total} accounts</span><div className="flex gap-2"><Button variant="secondary" disabled={query.isFetching || filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>Previous</Button><Button variant="secondary" disabled={query.isFetching || filters.page >= pagination.totalPages} onClick={() => update({ page: filters.page + 1 })}>Next</Button></div></nav>}
    {modalOpen && <CreateUserModal onClose={() => setModalOpen(false)} />}{selected && <UserDetails key={`${selected.id}:${selected.action}`} {...selected} onClose={() => setSelected(null)} />}
  </div>;
}
export default function UsersPage() {
  const { user, role } = useAuth();
  return role === 'ADMIN' ? <UsersDirectory key={`${user.id}:${role}`} /> : <Navigate to="/dashboard" replace />;
}
