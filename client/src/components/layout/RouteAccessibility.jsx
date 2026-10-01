import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const titles = { '/login': 'Sign in', '/register': 'Create account', '/check-email': 'Check email', '/verify-email': 'Verify email', '/dashboard': 'Summary', '/tickets': 'Tickets', '/tickets/new': 'New ticket', '/tickets/archived': 'Archived work items', '/my-tickets': 'Assigned tickets', '/notifications': 'Notifications', '/knowledge': 'Knowledge Base', '/knowledge/manage': 'Manage Knowledge', '/knowledge/new': 'New knowledge article', '/reports': 'Reports', '/users': 'Users', '/departments': 'Departments', '/email-logs': 'Email logs', '/audit-log': 'Audit log', '/profile': 'Profile', '/settings': 'Settings', '/get-started': 'Get started', '/search': 'Search' };
export function routeTitle(pathname, search) {
  const section = new URLSearchParams(search).get('section');
  if (pathname === '/settings' && ['profile', 'appearance', 'notifications', 'shortcuts', 'security', 'sla', 'application'].includes(section)) return `Settings — ${section}`;
  return titles[pathname] || (/^\/tickets\/[^/]+$/.test(pathname) ? 'Ticket details' : /^\/saved-views\/[^/]+$/.test(pathname) ? 'Saved ticket view' : /^\/knowledge\/[^/]+\/edit$/.test(pathname) ? 'Edit knowledge draft' : /^\/knowledge\/[^/]+$/.test(pathname) ? 'Knowledge article' : 'Page not found');
}
export default function RouteAccessibility() {
  const { pathname, search } = useLocation(); const { user, role } = useAuth();
  const identity = `${user?.id || 'public'}:${role || ''}`; const previous = useRef(identity);
  const previousPath = useRef(pathname);
  useEffect(() => { document.title = `${routeTitle(pathname, search)} | HelpDesk`; }, [pathname, search]);
  useEffect(() => {
    const changed = previous.current !== identity || previousPath.current !== pathname;
    if (previous.current !== identity) toast.remove();
    previous.current = identity; previousPath.current = pathname;
    // Preserve the document-start Tab origin on initial load (including StrictMode).
    if (!changed) return undefined;
    // Focus the stable main landmark once per route/identity, never on polling,
    // filter edits or async record-title updates. No private text in tab titles.
    const frame = requestAnimationFrame(() => document.getElementById('main-content')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [pathname, identity]);
  return <a className="skip-link" href="#main-content" onClick={() => document.getElementById('main-content')?.focus()}>Skip to main content</a>;
}
export function PublicLayout() { return <main id="main-content" tabIndex={-1}><Outlet /></main>; }
