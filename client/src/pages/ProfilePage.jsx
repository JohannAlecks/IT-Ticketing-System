import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../utils/format';

const ROLE_LABELS = { ADMIN: 'Admin', AGENT: 'Support Agent', USER: 'User' };

export default function ProfilePage() {
  const { user } = useAuth();

  const initials = user?.name
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Profile</h1>
      <p className="mb-6 text-sm text-gray-500">Your account details</p>

      <div className="card p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
            {initials}
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
        </div>

        <dl className="space-y-4 border-t border-gray-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-800">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt>
            <dd className="text-gray-800">{ROLE_LABELS[user?.role] || user?.role}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Department</dt>
            <dd className="text-right text-gray-800">{user?.department || 'Not specified'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Member since</dt>
            <dd className="text-gray-800">{formatDateTime(user?.createdAt)}</dd>
          </div>
        </dl>
        <Link to="/settings" className="mt-6 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800">Edit profile in Settings</Link>
      </div>
    </div>
  );
}
