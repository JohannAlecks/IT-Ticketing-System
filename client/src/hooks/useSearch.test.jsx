import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSearch } from './useSearch';
import { searchApi } from '../api/search.api';
import { clearProtectedCache, protectedQueryKeys } from '../query/protectedCache';
const auth = vi.hoisted(() => ({ user: { id: 'first' }, role: 'ADMIN' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../api/search.api', () => ({ searchApi: vi.fn() }));
const clients = [];
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'first' }; auth.role = 'ADMIN'; });
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); clients.length = 0; });
function setup() {
  const client = new QueryClient(); clients.push(client);
  const hook = renderHook(({ q, type = 'all', page = 1, includeArchived = false }) => useSearch({ q, type, page, pageSize: 20, includeArchived }, 'full'), {
    initialProps: { q: '  vpn  ' }, wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { client, hook };
}
it('all privacy boundaries are in the key and no previous response is displayed during refetch', async () => {
  searchApi.mockResolvedValue({ marker: 'first-admin' }); const { hook } = setup();
  await waitFor(() => expect(hook.result.current.data?.marker).toBe('first-admin'));
  expect(searchApi).toHaveBeenCalledWith(expect.objectContaining({ q: 'vpn', type: 'all', page: 1, includeArchived: false }), 'full', expect.any(AbortSignal));
  searchApi.mockImplementation(() => new Promise(() => {}));
  act(() => { auth.role = 'USER'; hook.rerender({ q: 'vpn' }); }); expect(hook.result.current.data).toBeUndefined();
  act(() => { auth.user = { id: 'second' }; hook.rerender({ q: 'vpn', type: 'tickets', page: 2, includeArchived: true }); });
  expect(hook.result.current.data).toBeUndefined();
});
it('unmount and logout abort in-flight requests and late data cannot repopulate removed cache', async () => {
  let signal; let finish; searchApi.mockImplementation((params, mode, s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); });
  const { hook, client } = setup(); await waitFor(() => expect(signal).toBeDefined());
  await act(async () => { await clearProtectedCache(client); auth.user = null; hook.rerender({ q: 'vpn' }); });
  expect(signal.aborted).toBe(true); await act(async () => finish({ marker: 'private' }));
  expect(hook.result.current.data).toBeUndefined(); expect(client.getQueryCache().findAll({ queryKey: protectedQueryKeys.search('first', 'ADMIN') })).toHaveLength(0);
  hook.unmount();
});
it('same-account protected mutations invalidate search; other-account mutations do not', async () => {
  searchApi.mockResolvedValue({ groups: [] }); const { client, hook } = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
  const spy = vi.spyOn(client, 'invalidateQueries');
  await act(async () => { await client.getMutationCache().build(client, { mutationKey: ['protected', 'other', 'ticket-mutation'], mutationFn: async () => true }).execute(); });
  expect(spy).not.toHaveBeenCalled();
  await act(async () => { await client.getMutationCache().build(client, { mutationKey: ['protected', 'first', 'knowledge-mutation'], mutationFn: async () => true }).execute(); });
  expect(spy).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.search('first', 'ADMIN') });
});
