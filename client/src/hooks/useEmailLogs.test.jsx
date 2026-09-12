import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEmailLogs } from './useEmailLogs';
const auth = vi.hoisted(() => ({ user: { id: 'one' }, role: 'ADMIN' }));
const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../api/emailLogs.api', () => ({ emailLogsApi: api }));
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'one' }; auth.role = 'ADMIN'; });
afterEach(cleanup);
const wrap = (client) => ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
it.each(['USER', 'AGENT'])('%s cannot request list or details even with a cached entry', (role) => {
  auth.role = role; const client = new QueryClient();
  const hook = renderHook(() => [useEmailLogs(), useEmailLogs({}, 'log')], { wrapper: wrap(client) });
  expect(hook.result.current.every((q) => q.data === undefined)).toBe(true); expect(api.list).not.toHaveBeenCalled(); expect(api.detail).not.toHaveBeenCalled(); client.clear();
});
it('pagination changes hide previous page and propagate cancellation', async () => {
  const client = new QueryClient(); api.list.mockResolvedValueOnce({ logs: ['old-page'] }).mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(({ page }) => useEmailLogs({ page }), { initialProps: { page: 1 }, wrapper: wrap(client) });
  await waitFor(() => expect(hook.result.current.data?.logs).toEqual(['old-page'])); hook.rerender({ page: 2 }); expect(hook.result.current.data).toBeUndefined();
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2)); const signal = api.list.mock.calls[1][1]; hook.unmount(); expect(signal.aborted).toBe(true); client.clear();
});
it('late detail response after account switch cannot surface in the new account or remain cached', async () => {
  const client = new QueryClient(); let release; api.detail.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue({ id: 'new-account-log' });
  const hook = renderHook(() => useEmailLogs({}, 'log'), { wrapper: wrap(client) }); await waitFor(() => expect(release).toBeTypeOf('function'));
  const oldSignal = api.detail.mock.calls[0][1]; auth.user = { id: 'two' }; hook.rerender();
  await act(async () => { release({ id: 'old-account-log' }); }); expect(oldSignal.aborted).toBe(true);
  await waitFor(() => expect(hook.result.current.data?.id).toBe('new-account-log'));
  await waitFor(() => expect(client.getQueriesData({ queryKey: ['protected', 'one'] })).toEqual([])); client.clear();
});
it('logout/role loss cancels requests and immediately hides metadata', async () => {
  const client = new QueryClient(); api.list.mockResolvedValue({ logs: ['private'] });
  const hook = renderHook(() => useEmailLogs(), { wrapper: wrap(client) }); await waitFor(() => expect(hook.result.current.data).toBeDefined());
  auth.role = 'USER'; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
  auth.user = null; hook.rerender(); expect(hook.result.current.data).toBeUndefined(); client.clear();
});
it('refetch error hides stale metadata', async () => {
  const client = new QueryClient(); api.list.mockResolvedValueOnce({ logs: ['private'] }).mockRejectedValue(new Error('unavailable'));
  const hook = renderHook(() => useEmailLogs(), { wrapper: wrap(client) }); await waitFor(() => expect(hook.result.current.data).toBeDefined());
  await act(async () => { await hook.result.current.refetch(); }); await waitFor(() => expect(hook.result.current.data).toBeUndefined()); client.clear();
});
