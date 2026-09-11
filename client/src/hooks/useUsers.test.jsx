import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useUsers, useUserSummary, useUserDetails, useDeactivateUser } from './useUsers';
import { clearProtectedCache } from '../query/protectedCache';
const auth = vi.hoisted(() => ({ user: { id: 'a' }, role: 'ADMIN' }));
const api = vi.hoisted(() => ({ listAll: vi.fn(), summary: vi.fn(), details: vi.fn(), deactivate: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth })); vi.mock('../api/users.api', () => ({ usersApi: api })); vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'a' }; auth.role = 'ADMIN'; }); afterEach(cleanup);
const wrap = (client) => ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
it.each(['USER', 'AGENT'])('%s never requests Admin directory/summary/details', (role) => { auth.role = role; const client = new QueryClient(); renderHook(() => [useUsers({}), useUserSummary(), useUserDetails('target')], { wrapper: wrap(client) }); expect(api.listAll).not.toHaveBeenCalled(); expect(api.summary).not.toHaveBeenCalled(); expect(api.details).not.toHaveBeenCalled(); });
it('filter changes abort obsolete queries; account/role transitions cannot reuse Admin data', async () => {
  const client = new QueryClient(); api.listAll.mockResolvedValueOnce({ users: ['private'] }).mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(({ page }) => useUsers({ page }), { initialProps: { page: 1 }, wrapper: wrap(client) }); await waitFor(() => expect(hook.result.current.data?.users).toEqual(['private']));
  hook.rerender({ page: 2 }); expect(hook.result.current.data).toBeUndefined(); const signal = api.listAll.mock.calls.at(-1)[1];
  await act(async () => { await clearProtectedCache(client); auth.role = 'USER'; hook.rerender({ page: 1 }); }); expect(signal.aborted).toBe(true); expect(hook.result.current.data).toBeUndefined(); client.clear();
});
it('late lifecycle response cannot invalidate or resurrect another account cache', async () => {
  const client = new QueryClient(); let finish; api.deactivate.mockImplementation(() => new Promise((resolve) => { finish = resolve; })); const spy = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(() => useDeactivateUser(), { wrapper: wrap(client) }); let pending; act(() => { pending = hook.result.current.mutateAsync('target'); }); await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => { await clearProtectedCache(client); auth.user = { id: 'b' }; hook.rerender(); }); await act(async () => { finish({}); await pending; }); expect(spy).not.toHaveBeenCalled(); client.clear();
});
