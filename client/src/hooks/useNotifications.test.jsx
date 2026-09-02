import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsApi } from '../api/notifications.api';
import { clearProtectedCache, protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';
import { notificationDestination, useMarkNotificationRead, useNotificationPreferences, useUnreadNotificationCount, useUpdateNotificationPreferences } from './useNotifications';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../api/notifications.api', () => ({ notificationsApi: { unreadCount: vi.fn(), list: vi.fn(), getPreferences: vi.fn(), updatePreferences: vi.fn(), markRead: vi.fn(), markUnread: vi.fn(), markAllRead: vi.fn() } }));

function wrapper(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  auth.user = null;
  vi.clearAllMocks();
});

describe('notification query safety', () => {
  it('does not start unread polling without an authenticated account', async () => {
    auth.user = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useUnreadNotificationCount(), { wrapper: wrapper(client) });
    await Promise.resolve();
    expect(notificationsApi.unreadCount).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(client.getQueryCache().getAll()[0].options.enabled).toBe(false);
  });

  it('uses a stable account-rooted unread query with foreground-only 45 second polling', async () => {
    auth.user = { id: 'account-a' };
    notificationsApi.unreadCount.mockResolvedValueOnce({ unreadCount: 2 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useUnreadNotificationCount(), { wrapper: wrapper(client) });
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalled());
    const query = client.getQueryCache().find({ queryKey: [...protectedQueryKeys.notifications('account-a'), 'unread-count'] });
    expect(query.options.refetchInterval).toBe(45_000);
    expect(query.options.refetchIntervalInBackground).toBe(false);
    expect(query.options.refetchOnWindowFocus).toBe(true);
  });

  it('loads role-qualified preferences with TanStack Query AbortSignal', async () => {
    auth.user = { id: 'account-a', role: 'AGENT' };
    let receivedSignal;
    notificationsApi.getPreferences.mockImplementation((signal) => {
      receivedSignal = signal;
      return Promise.resolve({ preferences: { ticketAssigned: true }, mandatory: ['accountReactivated'] });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.data?.preferences?.ticketAssigned).toBe(true));
    expect(notificationsApi.getPreferences).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(client.getQueryData(protectedQueryKeys.notificationPreferences('account-a', 'AGENT'))).toEqual({
      preferences: { ticketAssigned: true },
      mandatory: ['accountReactivated'],
    });
  });

  it('does not flash the previous account preferences when the identity changes', async () => {
    auth.user = { id: 'account-a', role: 'USER' };
    let resolveFirst;
    let resolveSecond;
    notificationsApi.getPreferences
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client) });

    await waitFor(() => expect(resolveFirst).toBeDefined());
    resolveFirst({ preferences: { ticketStatusChanged: true }, mandatory: ['accountReactivated'] });
    await waitFor(() => expect(result.current.data?.preferences?.ticketStatusChanged).toBe(true));

    auth.user = { id: 'account-b', role: 'USER' };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(resolveSecond).toBeDefined());
    expect(result.current.data).toBeUndefined();
    resolveSecond({ preferences: { ticketStatusChanged: false }, mandatory: ['accountReactivated'] });
    await waitFor(() => expect(result.current.data?.preferences?.ticketStatusChanged).toBe(false));
  });

  it('updates only the active role-qualified preferences cache', async () => {
    auth.user = { id: 'account-a', role: 'ADMIN' };
    const response = { preferences: { ticketAssigned: false }, mandatory: ['accountReactivated'] };
    notificationsApi.updatePreferences.mockResolvedValue(response);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const queryKey = protectedQueryKeys.notificationPreferences('account-a', 'ADMIN');
    client.setQueryData(queryKey, { preferences: { ticketAssigned: true }, mandatory: ['accountReactivated'] });
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper: wrapper(client) });

    await act(async () => { await result.current.mutateAsync({ ticketAssigned: false }); });
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({ ticketAssigned: false });
    expect(client.getQueryData(queryKey)).toEqual(response);
    expect(client.getMutationCache().findAll({ mutationKey: protectedMutationKeys.notificationPreferences('account-a', 'ADMIN') })).toHaveLength(1);
  });

  it('derives destinations only from known notification types and identifiers', () => {
    expect(notificationDestination({ type: 'TICKET_PUBLIC_REPLY', ticketId: 'tick/1' })).toBe('/tickets/tick%2F1');
    expect(notificationDestination({ type: 'KNOWLEDGE_PUBLISHED', articleId: 'article-1' })).toBe('/knowledge/article-1/edit');
    expect(notificationDestination({ type: 'ACCOUNT_REACTIVATED' })).toBe('/profile');
    expect(notificationDestination({ type: 'UNKNOWN', url: 'https://unsafe.example' })).toBeNull();
    expect(notificationDestination({ type: 'TICKET_PUBLIC_REPLY', ticketId: '' })).toBeNull();
  });

  it('does not restore an optimistic notification after logout cleanup and a late mutation failure', async () => {
    auth.user = { id: 'account-a' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const root = protectedQueryKeys.notifications('account-a');
    const listKey = [...root, 'list', { status: 'ALL', page: 1, limit: 12 }];
    client.setQueryData(listKey, { notifications: [{ id: 'n-1', readAt: null }] });
    let rejectRequest;
    notificationsApi.markRead.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    const { result, rerender } = renderHook(() => useMarkNotificationRead(), { wrapper: wrapper(client) });
    act(() => result.current.mutate('n-1'));
    await waitFor(() => expect(client.getQueryData(listKey).notifications[0].readAt).toBeTruthy());
    await clearProtectedCache(client);
    auth.user = null;
    rerender();
    rejectRequest(new Error('late failure'));
    await waitFor(() => expect(client.getQueryData(listKey)).toBeUndefined());
  });
});
