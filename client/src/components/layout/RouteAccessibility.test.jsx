import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import RouteAccessibility, { routeTitle } from './RouteAccessibility';
import AppLayout from './AppLayout';
const state = vi.hoisted(() => ({ user: { id: 'one' }, role: 'USER', clear: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state }));
vi.mock('react-hot-toast', () => ({ default: { remove: state.clear } }));
vi.mock('./Header', () => ({ default: () => <header>Header</header> }));
vi.mock('./Sidebar', () => ({ default: () => <nav>Navigation</nav> }));
afterEach(() => { cleanup(); state.user = { id: 'one' }; state.role = 'USER'; state.clear.mockClear(); });
function Draft() { const [value, setValue] = useState(''); return <><label>Draft<input value={value} onChange={e => setValue(e.target.value)} /></label><Link to="/tickets">Tickets</Link><Link to="?page=2">Filter</Link></>; }
function View() { return <MemoryRouter initialEntries={['/dashboard']}><RouteAccessibility /><Routes><Route element={<AppLayout />}><Route path="*" element={<Draft />} /></Route></Routes></MemoryRouter>; }
it('keeps initial keyboard origin at document start and makes the skip link target the main landmark', () => {
  render(<View />); expect(screen.getByRole('main')).not.toHaveFocus();
  fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' })); expect(screen.getByRole('main')).toHaveFocus();
});
it('focuses main on a route change but not on filter edits', async () => {
  render(<View />); fireEvent.click(screen.getByRole('link', { name: 'Tickets', exact: true }));
  await waitFor(() => expect(screen.getByRole('main')).toHaveFocus()); expect(document.title).toBe('Tickets | HelpDesk');
  const draft = screen.getByLabelText('Draft'); draft.focus(); fireEvent.click(screen.getByRole('link', { name: 'Filter' }));
  await waitFor(() => expect(draft).toHaveFocus());
});
it('remounts protected screen drafts and clears toast announcements on account and role changes', async () => {
  const view = render(<View />); fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'previous account' } });
  state.user = { id: 'two' }; view.rerender(<View />);
  expect(screen.getByLabelText('Draft')).toHaveValue(''); expect(state.clear).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'previous role' } }); state.role = 'ADMIN'; view.rerender(<View />);
  expect(screen.getByLabelText('Draft')).toHaveValue(''); expect(state.clear).toHaveBeenCalledTimes(2);
});
it('never copies private query text or record identifiers into document titles', () => {
  expect(routeTitle('/tickets/private-id', '?q=private-content')).toBe('Ticket details');
  expect(routeTitle('/settings', '?section=private-content')).toBe('Settings');
});
