import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDepartments, useDepartmentMutation } from './useDepartments';
const auth = vi.hoisted(() => ({ user: { id: 'one' }, role: 'ADMIN', updateUser: vi.fn() }));
const api = vi.hoisted(() => ({ list: vi.fn(), options: vi.fn(), members: vi.fn(), merge: vi.fn(), me: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth })); vi.mock('../api/departments.api', () => ({ departmentsApi: api })); vi.mock('../api/settings.api', () => ({ settingsApi: { me: api.me } }));
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'one' }; auth.role = 'ADMIN'; api.options.mockResolvedValue({ departments: [] }); }); afterEach(cleanup);
const wrap = (client) => ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
it.each(['USER', 'AGENT'])('%s only requests safe options, not management data', async (role) => {
  auth.role = role; const client = new QueryClient(); renderHook(() => [useDepartments('list'), useDepartments('members', {}, 'id'), useDepartments('options')], { wrapper: wrap(client) });
  await waitFor(() => expect(api.options).toHaveBeenCalled()); expect(api.list).not.toHaveBeenCalled(); expect(api.members).not.toHaveBeenCalled(); client.clear();
});
it('role/account/filter changes never reuse protected data and cancel obsolete requests', async () => {
  const client = new QueryClient(); api.list.mockResolvedValueOnce({ departments: ['private'] }).mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(({ page }) => useDepartments('list', { page }), { initialProps: { page: 1 }, wrapper: wrap(client) }); await waitFor(() => expect(hook.result.current.data?.departments).toEqual(['private']));
  hook.rerender({ page: 2 }); const signal = api.list.mock.calls.at(-1)[1]; expect(hook.result.current.data).toBeUndefined();
  auth.user = { id: 'two' }; auth.role = 'USER'; hook.rerender({ page: 1 }); expect(signal.aborted).toBe(true); expect(hook.result.current.data).toBeUndefined(); client.clear();
});
it('late mutations cannot update Auth or invalidate another account', async () => {
  let release; api.merge.mockImplementation(() => new Promise((resolve) => { release = resolve; })); const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(() => useDepartmentMutation('merge'), { wrapper: wrap(client) }); let pending; act(() => { pending = hook.result.current.mutateAsync({}); }); await waitFor(() => expect(release).toBeTypeOf('function'));
  auth.user = { id: 'two' }; hook.rerender(); await act(async () => { release({}); await pending; }); expect(api.me).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled(); client.clear();
});
it('an account switch during post-mutation profile refresh cannot restore the previous account', async () => {
  api.merge.mockResolvedValue({}); let release; api.me.mockImplementation(() => new Promise((resolve) => { release = resolve; })); const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(() => useDepartmentMutation('merge'), { wrapper: wrap(client) }); let pending; act(() => { pending = hook.result.current.mutateAsync({}); }); await waitFor(() => expect(release).toBeTypeOf('function'));
  auth.user = { id: 'two' }; hook.rerender(); await act(async () => { release({ id: 'one', department: 'Old' }); await pending; });
  expect(auth.updateUser).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled(); client.clear();
});
