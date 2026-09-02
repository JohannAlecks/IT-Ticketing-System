import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, ChevronDown, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUnreadNotificationCount } from '../../hooks/useNotifications';
import NotificationsDropdown from '../notifications/NotificationsDropdown';

const ROLE_LABELS = { ADMIN: 'Admin', AGENT: 'Support Agent', USER: 'User' };

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef(null);
  const unreadQuery = useUnreadNotificationCount();
  const unreadCount = Math.max(0, Number(unreadQuery.data?.unreadCount || 0));
  const unreadLabel = unreadCount > 99 ? '99+' : unreadCount;

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
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="relative">
          <button
            ref={bellRef}
            type="button"
            onClick={() => setNotificationsOpen((value) => !value)}
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden="true">{unreadLabel}</span>}
            {unreadCount > 0 && <span className="sr-only">{unreadCount} unread notifications</span>}
          </button>
          {notificationsOpen && <NotificationsDropdown onClose={() => setNotificationsOpen(false)} bellRef={bellRef} unreadCount={unreadCount} />}
        </div>
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
      </div>
    </header>
  );
}
