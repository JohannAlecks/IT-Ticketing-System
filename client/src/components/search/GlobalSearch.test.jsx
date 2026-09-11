import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';
import { searchApi } from '../../api/search.api';
import { clearProtectedCache } from '../../query/protectedCache';
const auth = vi.hoisted(() => ({ user: { id: 'one', role: 'USER' }, role: 'USER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../api/search.api', () => ({ searchApi: vi.fn() }));
const ticket = { id: 'abcd1234', type: 'ticket', title: '<img src=x onerror=alert(1)>VPN', subtitle: 'Requester: Me', updatedAt: '2026-09-11', metadata: { status: 'OPEN', category: 'VPN' } };
const article = { id: 'kb', type: 'knowledge', title: 'VPN Guide', subtitle: '<script>plain excerpt</script>', path: '/knowledge/vpn-guide', metadata: {} };
const person = { id: 'staff', type: 'user', title: 'Directory person', subtitle: 'fixture@example.test', metadata: { role: 'AGENT' } };
const payload = { groups: [{ type: 'tickets', results: [ticket] }, { type: 'knowledge', results: [article] }, { type: 'users', results: [person] }] };
const clients = [];
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'one', role: 'USER' }; auth.role = 'USER'; searchApi.mockResolvedValue(payload); });
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); clients.length = 0; vi.useRealTimers(); });
function Location() { const l = useLocation(); return <span data-testid="location">{l.pathname}{l.search}{l.hash}</span>; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const ui = () => <QueryClientProvider client={client}><MemoryRouter><GlobalSearch /><Location /><button>Outside</button></MemoryRouter></QueryClientProvider>;
  return { ...render(ui()), ui, client };
}
const type = (value) => fireEvent.change(screen.getByRole('combobox'), { target: { value } });
it('does not request before two meaningful characters, debounces 300ms, and excludes archives', async () => {
  vi.useFakeTimers(); setup(); type('a'); await act(async () => { vi.advanceTimersByTime(500); }); expect(searchApi).not.toHaveBeenCalled();
  type('ab'); await act(async () => { vi.advanceTimersByTime(299); }); expect(searchApi).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); }); expect(searchApi).toHaveBeenCalledWith({ q: 'ab', type: 'all', includeArchived: false, limit: 5 }, 'quick', expect.any(AbortSignal));
});
it.each(['USER', 'AGENT', 'ADMIN'])('%s only renders authorized groups and renders HTML as text', async (role) => {
  auth.role = role; setup(); type('vpn'); await screen.findByText('VPN Guide');
  expect(screen.getByRole('group', { name: 'Tickets' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Users' }) !== null).toBe(role === 'ADMIN');
  expect(screen.getByText(ticket.title)).toBeInTheDocument(); expect(screen.getByText(article.subtitle)).toBeInTheDocument();
  expect(document.querySelector('img, script')).toBeNull();
});
it('arrow keys choose results, Enter opens trusted path, and Escape returns focus', async () => {
  setup(); type('vpn'); await screen.findByText('VPN Guide'); const input = screen.getByRole('combobox'); input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveAttribute('aria-expanded', 'false'); expect(input).toHaveFocus();
  fireEvent.focus(input); await screen.findByText('VPN Guide');
  fireEvent.keyDown(input, { key: 'ArrowUp' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByTestId('location')).toHaveTextContent('/knowledge/vpn-guide');
});
it('outside click closes and View all preserves the query in the URL', async () => {
  const { client } = setup(); type('vpn access'); await screen.findByText('VPN Guide');
  fireEvent.pointerDown(screen.getByText('Outside')); expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  await waitFor(() => expect(client.getQueryCache().getAll().some((query) => query.queryKey.at(-1)?.q)).toBe(false));
  fireEvent.focus(screen.getByRole('combobox')); fireEvent.click(screen.getByText('View all results'));
  expect(screen.getByTestId('location')).toHaveTextContent('/search?q=vpn+access');
});
it('input changes abort old requests immediately; late responses cannot replace newer results', async () => {
  let finish; let oldSignal;
  searchApi.mockImplementationOnce((params, mode, signal) => { oldSignal = signal; return new Promise((resolve) => { finish = resolve; }); }).mockResolvedValue({ groups: [{ type: 'tickets', results: [{ ...ticket, title: 'New match' }] }] });
  setup(); type('old'); await waitFor(() => expect(oldSignal).toBeDefined()); type('new');
  await waitFor(() => expect(oldSignal.aborted).toBe(true)); await screen.findByText('New match');
  await act(async () => finish(payload)); expect(screen.queryByText('VPN Guide')).not.toBeInTheDocument();
});
it('Escape closes from dropdown actions and returns focus without reopening', async () => {
  setup(); type('vpn'); await screen.findByText('VPN Guide');
  const action = screen.getByText('View all results'); action.focus();
  fireEvent.keyDown(action, { key: 'Escape' });
  expect(screen.getByRole('combobox')).toHaveFocus();
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
});
it('account switching cancels and clears results and local query text', async () => {
  const ui = setup(); type('vpn'); await screen.findByText('VPN Guide');
  await act(async () => { await clearProtectedCache(ui.client); auth.user = { id: 'two', role: 'USER' }; ui.rerender(ui.ui()); });
  expect(screen.getByRole('combobox')).toHaveValue(''); expect(screen.queryByText('VPN Guide')).not.toBeInTheDocument();
  expect(ui.client.getQueryCache().getAll().some((q) => q.queryKey[1] === 'one')).toBe(false);
});
it('handles loading, safe errors/retry, and empty results', async () => {
  searchApi.mockRejectedValueOnce(new Error('raw secret error')).mockResolvedValue({ groups: [] }); setup(); type('vpn');
  expect(screen.getByRole('status')).toHaveTextContent('Searching'); await screen.findByRole('alert');
  expect(screen.queryByText('raw secret error')).not.toBeInTheDocument(); fireEvent.click(screen.getByText('Retry search'));
  await screen.findByText(/No matches/);
});
