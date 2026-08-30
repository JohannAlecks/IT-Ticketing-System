import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { authApi } from '../api/auth.api';
import { protectedQueryKeys } from '../query/protectedCache';

vi.mock('../api/auth.api', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn() },
}));

function renderAuth(client) {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthProvider protected cache cleanup', () => {
  it('removes protected data when a forced 401 logout occurs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    localStorage.setItem('token', 'token-a');
    authApi.me.mockResolvedValue({ id: 'account-a', role: 'USER' });
    const { result } = renderAuth(client);
    await waitFor(() => expect(result.current.user?.id).toBe('account-a'));
    client.setQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'), { title: 'Private' });
    client.setQueryData(['public', 'categories'], ['Hardware']);

    act(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(client.getQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'))).toBeUndefined();
    expect(client.getQueryData(['public', 'categories'])).toEqual(['Hardware']);
  });

  it('cleans the previous account before accepting a different login identity', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    localStorage.setItem('token', 'token-a');
    authApi.me.mockResolvedValue({ id: 'account-a', role: 'USER' });
    authApi.login.mockResolvedValue({ user: { id: 'account-b', role: 'USER' }, token: 'token-b' });
    const { result } = renderAuth(client);
    await waitFor(() => expect(result.current.user?.id).toBe('account-a'));
    client.setQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'), { title: 'Private' });

    await act(async () => { await result.current.login({ email: 'b@example.test', password: 'secret' }); });

    expect(result.current.user?.id).toBe('account-b');
    expect(client.getQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'))).toBeUndefined();
  });

  it('does not restore a late /auth/me result after a forced logout', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveRestore;
    authApi.me.mockImplementation(() => new Promise((resolve) => { resolveRestore = resolve; }));
    localStorage.setItem('token', 'expired-token');
    const { result } = renderAuth(client);

    act(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { resolveRestore({ id: 'stale-account', role: 'USER' }); });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });
});
