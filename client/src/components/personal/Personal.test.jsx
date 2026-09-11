import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedViewsBar from './SavedViewsBar';
import PersonalShortcuts, { ShortcutSidebar } from './PersonalShortcuts';
import { savedFilters } from './savedFilters';
const state = vi.hoisted(() => ({ auth: { user: { id: 'owner' }, role: 'USER' }, views: {}, shortcuts: {}, mutations: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../../hooks/usePersonal', () => ({ usePersonal: (kind) => state[kind], usePersonalMutation: (action) => state.mutations[action] }));
const view = { id: 'view-id', name: 'My open work', scope: 'MY_TICKETS', filters: { status: 'OPEN' }, version: 1, available: true, path: '/saved-views/view-id' };
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function show(ui) { return render(<MemoryRouter>{ui}<Location /></MemoryRouter>); }
beforeEach(() => {
  state.auth = { user: { id: 'owner' }, role: 'USER' };
  state.views = { data: { views: [view], scopes: ['MY_TICKETS', 'ARCHIVED'] }, refetch: vi.fn() };
  state.shortcuts = { data: { shortcuts: [], routes: [{ key: 'SUMMARY', label: 'Summary', path: '/dashboard' }] }, refetch: vi.fn() };
  for (const action of ['createView', 'updateView', 'deleteView', 'createShortcut', 'updateShortcut', 'deleteShortcut', 'reorder']) state.mutations[action] = { mutateAsync: vi.fn().mockResolvedValue(view), isPending: false };
});
afterEach(cleanup);
it('saves structured current filters only and selects a saved-view destination', async () => {
  show(<SavedViewsBar filters={{ status: 'OPEN', page: 4, limit: 15, search: 'private temporary text', archive: 'active' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));
  fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'My work' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save view name' }));
  await waitFor(() => expect(state.mutations.createView.mutateAsync).toHaveBeenCalledWith({ name: 'My work', scope: 'MY_TICKETS', filters: { status: 'OPEN' } }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/saved-views/view-id'));
  expect(savedFilters({ isWorkBlocking: false, userId: 'forged', search: 'private' })).toEqual({ isWorkBlocking: false });
});
it('selecting an existing view navigates without injecting filter query strings', () => {
  show(<SavedViewsBar filters={{ page: 5 }} />);
  fireEvent.change(screen.getByLabelText('Saved views'), { target: { value: view.id } });
  expect(screen.getByTestId('location')).toHaveTextContent('/saved-views/view-id');
});
it('dirty state permits explicit update, rename, save as new and add to shortcuts', async () => {
  const onSaved = vi.fn();
  show(<SavedViewsBar active={view} scope="MY_TICKETS" filters={{ status: 'PENDING' }} onSaved={onSaved} />);
  expect(screen.getByText(/Unsaved filter changes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update saved view' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(view, true));
  expect(state.mutations.updateView.mutateAsync).toHaveBeenCalledWith({ id: view.id, version: 1, filters: { status: 'PENDING' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename view' }));
  fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save view name' }));
  await waitFor(() => expect(state.mutations.updateView.mutateAsync).toHaveBeenCalledWith({ id: view.id, version: 1, name: 'Renamed' }));
  expect(onSaved).toHaveBeenCalledWith(view, false);
  fireEvent.click(screen.getByRole('button', { name: 'Add to shortcuts' }));
  await waitFor(() => expect(state.mutations.createShortcut.mutateAsync).toHaveBeenCalledWith({ targetType: 'SAVED_VIEW', savedViewId: view.id, label: view.name }));
  fireEvent.click(screen.getByRole('button', { name: 'Save as new' }));
  expect(screen.getByLabelText('View name')).toHaveValue('');
});
it('deleting requires an accessible confirmation explaining shortcut removal', async () => {
  show(<SavedViewsBar active={view} filters={view.filters} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete view' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('shortcuts will also be removed');
  expect(state.mutations.deleteView.mutateAsync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete view' }));
  await waitFor(() => expect(state.mutations.deleteView.mutateAsync).toHaveBeenCalledWith({ id: view.id, version: 1 }));
});
it('failures preserve form entries; polling cannot upgrade an open rename version', async () => {
  state.mutations.updateView.mutateAsync.mockRejectedValue({ response: { data: { message: 'Conflict; refresh first' } } });
  const ui = show(<SavedViewsBar active={view} filters={view.filters} />);
  fireEvent.click(screen.getByRole('button', { name: 'Rename view' }));
  fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Unsaved name' } });
  ui.rerender(<MemoryRouter><SavedViewsBar active={{ ...view, version: 2 }} filters={view.filters} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Save view name' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('View name')).toHaveValue('Unsaved name');
  expect(state.mutations.updateView.mutateAsync).toHaveBeenCalledWith({ id: view.id, version: 1, name: 'Unsaved name' });
});
it('sidebar hides empty/unavailable destinations, sorts positions and closes mobile navigation', () => {
  const onClose = vi.fn(); const ui = show(<ShortcutSidebar onClose={onClose} />);
  expect(screen.queryByRole('region', { name: 'Personal shortcuts' })).not.toBeInTheDocument();
  state.shortcuts.data.shortcuts = [
    { id: 'b', label: 'Second', available: true, path: '/settings', position: 1 },
    { id: 'x', label: 'Unavailable', available: false, position: 2 },
    { id: 'a', label: 'First', available: true, path: '/dashboard', position: 0 },
  ];
  ui.rerender(<MemoryRouter><ShortcutSidebar onClose={onClose} /></MemoryRouter>);
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['First', 'Second']);
  fireEvent.click(screen.getByRole('link', { name: 'First' })); expect(onClose).toHaveBeenCalled();
  state.shortcuts.isError = true; ui.rerender(<MemoryRouter><ShortcutSidebar /></MemoryRouter>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('management offers only server-authorized choices and saves safe targets', async () => {
  show(<PersonalShortcuts />);
  expect(screen.queryByRole('option', { name: 'Users' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Shortcut destination'), { target: { value: 'route:SUMMARY' } });
  fireEvent.change(screen.getByLabelText('Shortcut label'), { target: { value: 'My start' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }));
  await waitFor(() => expect(state.mutations.createShortcut.mutateAsync).toHaveBeenCalledWith({ targetType: 'ROUTE', routeKey: 'SUMMARY', label: 'My start' }));
});
it('keyboard-operable ordering sends complete owned versions; rename/remove work', async () => {
  state.shortcuts.data.shortcuts = [{ id: 'a', version: 1, label: 'First', available: true }, { id: 'b', version: 3, label: 'Second', available: false }];
  show(<PersonalShortcuts />);
  const move = screen.getByRole('button', { name: 'Move Second up' }); move.focus(); expect(document.activeElement).toBe(move); fireEvent.click(move);
  await waitFor(() => expect(state.mutations.reorder.mutateAsync).toHaveBeenCalledWith({ items: [{ id: 'b', version: 3 }, { id: 'a', version: 1 }] }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename First' }));
  fireEvent.change(screen.getByLabelText('New shortcut label'), { target: { value: 'New label' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save shortcut label' }));
  await waitFor(() => expect(state.mutations.updateShortcut.mutateAsync).toHaveBeenCalledWith({ id: 'a', version: 1, label: 'New label' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Second' }));
  await waitFor(() => expect(state.mutations.deleteShortcut.mutateAsync).toHaveBeenCalledWith({ id: 'b', version: 3 }));
});
it('limits, loading, retry and saving states are explicit', () => {
  state.shortcuts.data.shortcuts = Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: `Item ${i}`, available: true }));
  const ui = show(<PersonalShortcuts />);
  expect(screen.getByText(/8 of 8 shortcuts/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Add shortcut' })).toBeDisabled();
  state.shortcuts.isError = true; ui.rerender(<MemoryRouter><PersonalShortcuts /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Retry preferences' })); expect(state.shortcuts.refetch).toHaveBeenCalled();
  state.shortcuts = { isLoading: true }; ui.rerender(<MemoryRouter><PersonalShortcuts /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading shortcuts');
});
it('account switch clears local preference drafts immediately', () => {
  const ui = show(<PersonalShortcuts />);
  fireEvent.change(screen.getByLabelText('Shortcut label'), { target: { value: 'Private draft' } });
  state.auth.user = { id: 'other' }; state.shortcuts.data = { shortcuts: [], routes: [] };
  ui.rerender(<MemoryRouter><PersonalShortcuts /></MemoryRouter>);
  expect(screen.getByLabelText('Shortcut label')).toHaveValue('');
});
