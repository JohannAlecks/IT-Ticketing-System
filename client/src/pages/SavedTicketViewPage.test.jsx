import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedTicketViewPage from './SavedTicketViewPage';
const state = vi.hoisted(() => ({ query: {}, pagination: [], preview: {}, update: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' }, role: 'USER' }) }));
vi.mock('../hooks/useAgents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('../hooks/usePersonal', () => ({
  useSavedTickets: (id, page) => { state.pagination.push(page); return state.query; },
  usePersonal: () => ({ data: { views: [state.query.data?.view].filter(Boolean) } }),
  usePersonalMutation: () => ({ mutateAsync: state.update }),
}));
vi.mock('../hooks/useTickets', () => ({ useTickets: (filters) => { state.preview = filters; return { data: { tickets: [], pagination: { page: filters.page, total: 30, totalPages: 2 } } }; } }));
beforeEach(() => {
  state.pagination = []; state.update.mockReset().mockResolvedValue({});
  state.query = { data: { view: { id: 'one', name: 'Open', filters: { status: 'OPEN' }, scope: 'MY_TICKETS', version: 1, available: true }, tickets: [], pagination: { page: 1, total: 30, totalPages: 2 } }, refetch: vi.fn() };
});
afterEach(cleanup);
const ui = () => <MemoryRouter initialEntries={['/saved-views/one']}><Routes><Route path="/saved-views/:id" element={<SavedTicketViewPage />} /></Routes></MemoryRouter>;
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
