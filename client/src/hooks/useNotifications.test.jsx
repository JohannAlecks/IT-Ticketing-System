import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { notificationsApi } from '../api/notifications.api';
import { clearProtectedCache, protectedQueryKeys } from '../query/protectedCache';
import { notificationDestination, useMarkNotificationRead, useUnreadNotificationCount } from './useNotifications';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../api/notifications.api', () => ({ notificationsApi: { unreadCount: vi.fn(), list: vi.fn(), markRead: vi.fn(), markUnread: vi.fn(), markAllRead: vi.fn() } }));

function wrapper(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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
