import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TicketWatching from './TicketWatching';
const auth = vi.hoisted(() => ({ user: { id: 'a' }, role: 'USER' }));
const query = vi.hoisted(() => ({ data: undefined, refetch: vi.fn() }));
const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../hooks/useWatching', () => ({ useWatching: () => query, useSetWatching: () => mutation }));
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(query, { data: { isWatching: false }, isLoading: false, isPending: false, isFetching: false, isError: false, error: null });
  mutation.isPending = false; auth.user = { id: 'a' }; auth.role = 'USER';
});
afterEach(cleanup);
const ticket = { id: 'ticket' };
it('loads Watch, prevents duplicate clicks, and reports success without optimistic state', async () => {
  let finish; mutation.mutateAsync.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<TicketWatching ticket={ticket} />);
  expect(screen.getByText(/future public updates/)).toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Watch ticket' }); button.focus(); expect(button).toHaveFocus();
  fireEvent.click(button); fireEvent.click(button); expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
  expect(mutation.mutateAsync).toHaveBeenCalledWith(true);
  await act(async () => finish()); expect(screen.getByRole('status')).toHaveTextContent('Watching this ticket.');
});
it('failure leaves existing watching state unchanged and hides raw error', async () => {
  query.data = { isWatching: true }; mutation.mutateAsync.mockRejectedValue(new Error('private database detail'));
  render(<TicketWatching ticket={ticket} />); fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Stop watching' })).toBeInTheDocument();
  expect(screen.queryByText(/private database detail/)).not.toBeInTheDocument();
});
it('archived non-watcher cannot Watch; existing watcher can stop', async () => {
  const view = render(<TicketWatching ticket={{ ...ticket, archivedAt: 'now' }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  query.data = { isWatching: true }; view.rerender(<TicketWatching ticket={{ ...ticket, archivedAt: 'now' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
  await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledWith(false));
});
it('loading, retry, saving and inaccessible states are safe', () => {
  query.data = undefined; query.isLoading = true;
  const view = render(<TicketWatching ticket={ticket} />); expect(screen.getByRole('status')).toHaveTextContent('Loading');
  query.isLoading = false; query.isError = true; view.rerender(<TicketWatching ticket={ticket} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry watching state' })); expect(query.refetch).toHaveBeenCalled();
  query.isError = false; query.data = { isWatching: false }; mutation.isPending = true; view.rerender(<TicketWatching ticket={ticket} />);
  expect(screen.getByRole('button', { name: 'Watch ticket' })).toBeDisabled();
  query.error = { response: { status: 404 } }; view.rerender(<TicketWatching ticket={ticket} />); expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
it('account switch remounts transient messages rather than flashing prior account result', async () => {
  const view = render(<TicketWatching ticket={ticket} />); fireEvent.click(screen.getByRole('button', { name: 'Watch ticket' }));
  await screen.findByText('Watching this ticket.');
  auth.user = { id: 'b' }; query.data = undefined; query.isLoading = true; view.rerender(<TicketWatching ticket={ticket} />);
  expect(screen.queryByText('Watching this ticket.')).not.toBeInTheDocument(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
