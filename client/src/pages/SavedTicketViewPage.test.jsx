import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedTicketViewPage from './SavedTicketViewPage';
const state = vi.hoisted(() => ({ query: {}, pagination: [], preview: {}, update: vi.fn(), auth: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../hooks/useAgents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('../hooks/usePersonal', () => ({
  useSavedTickets: (id, page) => { state.pagination.push(page); return state.query; },
  usePersonal: () => ({ data: { views: [state.query.data?.view].filter(Boolean) } }),
  usePersonalMutation: () => ({ mutateAsync: state.update }),
}));
vi.mock('../hooks/useTickets', () => ({ useTickets: (filters) => { state.preview = filters; return { data: { tickets: [], pagination: { page: filters.page, total: 30, totalPages: 2 } } }; } }));
beforeEach(() => {
  state.auth = { user: { id: 'owner' }, role: 'USER' };
  state.pagination = []; state.update.mockReset().mockResolvedValue({});
  state.query = { data: { view: { id: 'one', name: 'Open', filters: { status: 'OPEN' }, scope: 'MY_TICKETS', version: 1, available: true }, tickets: [], pagination: { page: 1, total: 30, totalPages: 2 } }, refetch: vi.fn() };
});
afterEach(cleanup);
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
const ui = () => <MemoryRouter initialEntries={['/saved-views/one']}><Location /><Routes><Route path="/saved-views/:id" element={<SavedTicketViewPage />} /><Route path="/tickets" element={<h1>Active tickets</h1>} /><Route path="/tickets/archived" element={<h1>Archived tickets</h1>} /></Routes></MemoryRouter>;
it.each([['MY_TICKETS', '/tickets'], ['ARCHIVED', '/tickets/archived']])('successful %s deletion navigates even when its refetch removes the controls', async (scope, destination) => {
  state.query.data.view.scope = scope; let finish;
  state.update.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const rendered = render(ui()); fireEvent.click(screen.getByRole('button', { name: 'Delete view' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete view' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  state.query = { ...state.query, isError: true, error: { response: { status: 404 } } }; rendered.rerender(ui());
  expect(screen.queryByRole('button', { name: 'Delete view' })).not.toBeInTheDocument();
  await act(async () => { finish({}); });
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(destination));
});
it.each(['logout', 'account', 'role'])('late deletion cannot navigate after a %s change', async (change) => {
  let finish; state.update.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const rendered = render(ui()); fireEvent.click(screen.getByRole('button', { name: 'Delete view' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete view' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  state.auth = change === 'logout' ? { user: null, role: null } : { user: { id: change === 'account' ? 'other' : 'owner' }, role: change === 'role' ? 'AGENT' : 'USER' };
  state.query = { ...state.query, isError: true, error: { response: { status: 404 } } }; rendered.rerender(ui());
  await act(async () => { finish({}); });
  expect(screen.getByTestId('location')).toHaveTextContent('/saved-views/one');
});
it('applies server filters, resets pagination and preserves draft version across polls/errors', async () => {
  const rendered = render(ui());
  expect(screen.getByLabelText('Status')).toHaveValue('OPEN');
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PENDING' } });
  expect(state.preview.page).toBe(1); expect(screen.getByText(/Unsaved filter changes/)).toBeInTheDocument();
  state.query = { ...state.query, isError: true, error: { response: { status: 503 } }, data: { ...state.query.data, view: { ...state.query.data.view, version: 2 } } };
  rendered.rerender(ui()); expect(screen.getByLabelText('Status')).toHaveValue('PENDING');
  fireEvent.click(screen.getByRole('button', { name: 'Update saved view' }));
  await waitFor(() => expect(state.update).toHaveBeenCalledWith({ id: 'one', version: 1, filters: { status: 'PENDING' } }));
});
it('permission failures do not display stored filters or ticket results', () => {
  state.query.isError = true; state.query.error = { response: { status: 404 } }; render(ui());
  expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
});
