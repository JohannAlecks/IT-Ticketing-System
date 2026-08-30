import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket, PlusCircle, Users, Settings, User, LifeBuoy, ClipboardList, ScrollText, X, Sparkles, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

// Nav is role-aware per role: USER, AGENT, ADMIN each see a different set
// of links, matching what each role can actually do against the API.
export default function Sidebar({ mobileOpen, onClose }) {
  const { role, user } = useAuth();

  const ticketsLabel = role === 'ADMIN' ? 'All Tickets' : role === 'USER' ? 'My Tickets' : 'Tickets';

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:w-64 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[72px] items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div><span className="block text-base font-bold tracking-tight text-slate-950">HelpDesk</span><span className="block text-[11px] text-slate-500">IT Support & Service Desk</span></div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"><X className="h-4 w-4" /></button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="eyebrow px-3 pb-2 pt-1">Workspace</p>
        <NavLink to="/dashboard" className={linkClass}>
          <LayoutDashboard className="h-[18px] w-[18px]" /> Summary
        </NavLink>
        <NavLink to="/tickets" className={linkClass}>
          <Ticket className="h-[18px] w-[18px]" /> {ticketsLabel}
        </NavLink>

        {role === 'AGENT' && (
          <NavLink to="/my-tickets" className={linkClass}>
            <ClipboardList className="h-[18px] w-[18px]" /> My Tickets
          </NavLink>
        )}

        <NavLink to="/tickets/new" className={linkClass}>
          <PlusCircle className="h-[18px] w-[18px]" /> New Ticket
        </NavLink>
        {(role === 'AGENT' || role === 'ADMIN') && (
          <NavLink to="/reports" className={linkClass}>
            <BarChart3 className="h-[18px] w-[18px]" /> {role === 'AGENT' ? 'My Reports' : 'Reports'}
          </NavLink>
        )}
        <NavLink to="/get-started" className={linkClass}><Sparkles className="h-[18px] w-[18px]" /> Get started</NavLink>

        {role === 'ADMIN' && (
          <><p className="eyebrow px-3 pb-2 pt-5">Administration</p><NavLink to="/users" className={linkClass}><Users className="h-[18px] w-[18px]" /> Users</NavLink><NavLink to="/audit-log" className={linkClass}><ScrollText className="h-[18px] w-[18px]" /> Audit log</NavLink></>
        )}

        <p className="eyebrow px-3 pb-2 pt-5">Account</p>

        <NavLink to="/profile" className={linkClass}>
          <User className="h-[18px] w-[18px]" /> Profile
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          <Settings className="h-[18px] w-[18px]" /> Settings
        </NavLink>
      </nav>
      <div className="border-t border-slate-200 p-3"><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{user?.name?.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p><p className="text-xs text-slate-500">{role === 'AGENT' ? 'Support agent' : role?.toLowerCase()}</p></div></div></div>
    </aside></>
  );
}
