import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useUsers, useCreateUser, useUpdateUserRole, useDeactivateUser, useReactivateUser } from '../hooks/useUsers';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ConfirmDialog from '../components/ui/ConfirmDialog';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Add a user</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
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
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [status, setStatus] = useState('ACTIVE');
  const { data: users, isLoading, isError } = useUsers({ status });
  const updateRole = useUpdateUserRole();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const { user: currentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [userToChange, setUserToChange] = useState(null);

  const confirmStatusChange = () => {
    if (userToChange.isActive) deactivate.mutate(userToChange.id, { onSuccess: () => setUserToChange(null) });
    else reactivate.mutate(userToChange.id, { onSuccess: () => setUserToChange(null) });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage accounts, access levels, and account health.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <div className="flex items-center gap-3"><label htmlFor="user-status-filter" className="text-sm font-medium text-slate-700">Account status</label><select id="user-status-filter" className="input w-44" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All users</option></select></div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load users." />}

      {users && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Verification</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-4 font-semibold text-slate-800">{u.name}</td>
                  <td className="px-4 py-4 text-slate-600">{u.email}</td>
                  <td className="px-4 py-4 text-slate-600">{u.department || 'Not specified'}</td>
                  <td className="px-4 py-4">
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
                      value={u.role}
                      onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${u.emailVerified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>{u.emailVerified ? 'Verified' : 'Unverified'}</span></td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${u.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-4">{u.isActive ? <Button size="sm" variant="danger" disabled={u.id === currentUser?.id} onClick={() => setUserToChange(u)}>Deactivate account</Button> : <Button size="sm" variant="secondary" onClick={() => setUserToChange(u)}>Reactivate account</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <CreateUserModal onClose={() => setModalOpen(false)} />}
      <ConfirmDialog open={Boolean(userToChange)} title={userToChange?.isActive ? 'Deactivate account?' : 'Reactivate account?'} description={userToChange?.isActive ? `${userToChange?.name} (${userToChange?.email}) will lose access immediately. Existing history remains; unresolved assigned tickets will be unassigned.` : `Reactivate account for ${userToChange?.name}?\n\n${userToChange?.email} · ${userToChange?.role} · ${userToChange?.department || 'Not specified'}\n\nThis user will be able to sign in again. Previous tickets and activity will remain available. Old ticket assignments will not be restored automatically.`} confirmLabel={userToChange?.isActive ? 'Deactivate account' : 'Reactivate account'} danger={userToChange?.isActive} isLoading={reactivate.isPending || deactivate.isPending} onCancel={() => setUserToChange(null)} onConfirm={confirmStatusChange} />
    </div>
  );
}
