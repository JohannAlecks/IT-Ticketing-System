import { Outlet, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeNav = useCallback(() => setMobileNavOpen(false), []);
  const { pathname } = useLocation(); const { user, role } = useAuth(); const identity = `${user?.id}:${role}`;
  useEffect(closeNav, [pathname, identity, closeNav]);
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar key={identity} mobileOpen={mobileNavOpen} onClose={closeNav} />
      <div id="app-content" className="flex min-w-0 flex-1 flex-col">
        <Header key={identity} onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" data-identity={identity} tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet key={identity} />
        </main>
      </div>
    </div>
  );
}
