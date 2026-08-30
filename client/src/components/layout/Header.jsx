import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS = { ADMIN: 'Admin', AGENT: 'Support Agent', USER: 'User' };

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-[72px] flex-none items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <button onClick={onMenuClick} aria-label="Open navigation" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"><Menu className="h-5 w-5" /></button>
      <div className="hidden text-sm font-medium text-slate-500 md:block">Support workspace</div>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {open && (
          <div
            className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            onMouseLeave={() => setOpen(false)}
          >
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
