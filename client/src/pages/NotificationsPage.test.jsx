import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from './NotificationsPage';

const hooks = vi.hoisted(() => ({
  filters: null,
  query: { data: { notifications: [], pagination: { page: 1, totalPages: 1, total: 0 } }, isLoading: false, isError: false, refetch: vi.fn() },
  markRead: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  markUnread: { mutate: vi.fn(), isPending: false },
  markAll: { mutate: vi.fn(), isPending: false },
}));
vi.mock('../hooks/useNotifications', () => ({
  NOTIFICATION_TYPES: ['TICKET_PUBLIC_REPLY', 'KNOWLEDGE_PUBLISHED', 'ACCOUNT_REACTIVATED'],
  useNotifications: (filters) => { hooks.filters = filters; return hooks.query; },
  useMarkNotificationRead: () => hooks.markRead,
  useMarkNotificationUnread: () => hooks.markUnread,
  useMarkAllNotificationsRead: () => hooks.markAll,
  useUnreadNotificationCount: () => ({ data: { unreadCount: 0 } }),
  notificationDestination: (notice) => ({ TICKET_PUBLIC_REPLY: notice.ticketId && `/tickets/${notice.ticketId}`, KNOWLEDGE_PUBLISHED: notice.articleId && `/knowledge/${notice.articleId}/edit`, ACCOUNT_REACTIVATED: '/profile' }[notice.type] || null),
}));

function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output>; }
function renderPage() { return render(<MemoryRouter><NotificationsPage /><LocationProbe /></MemoryRouter>); }

afterEach(() => {
  cleanup();
  hooks.filters = null;
  hooks.query = { data: { notifications: [], pagination: { page: 1, totalPages: 1, total: 0 } }, isLoading: false, isError: false, refetch: vi.fn() };
  hooks.markRead = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
  hooks.markUnread = { mutate: vi.fn(), isPending: false };
  hooks.markAll = { mutate: vi.fn(), isPending: false };
});

describe('NotificationsPage', () => {
  it('renders a loading skeleton while notifications are loading', () => {
    hooks.query = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderPage();
    expect(screen.getByLabelText('Loading notifications')).toBeInTheDocument();
  });

  it('applies All/Unread/type filters and uses responsive notification layout', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    expect(hooks.filters.status).toBe('UNREAD');
    fireEvent.change(screen.getByLabelText('Notification type'), { target: { value: 'KNOWLEDGE_PUBLISHED' } });
    expect(hooks.filters.type).toBe('KNOWLEDGE_PUBLISHED');
    expect(screen.getByLabelText('Notification type').parentElement.parentElement.className).toContain('sm:');
  });

  it('paginates and exposes retryable errors', () => {
    hooks.query = { data: { notifications: [{ id: 'n-1', title: 'Unread', message: 'Safe', readAt: null, createdAt: '2026-09-01T00:00:00.000Z' }], pagination: { page: 1, totalPages: 2, total: 13 } }, isLoading: false, isError: false, refetch: vi.fn() };
    const { rerender } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(hooks.filters.page).toBe(2);
    hooks.query = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    rerender(<MemoryRouter><NotificationsPage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hooks.query.refetch).toHaveBeenCalled();
  });

  it('marks read before routing only to known ticket, article, and profile destinations', async () => {
    hooks.query.data = { notifications: [
      { id: 'ticket', type: 'TICKET_PUBLIC_REPLY', ticketId: 'ticket-1', title: 'Ticket update', message: 'Safe', readAt: null, createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'article', type: 'KNOWLEDGE_PUBLISHED', articleId: 'article-1', title: 'Article update', message: 'Safe', readAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'profile', type: 'ACCOUNT_REACTIVATED', title: 'Account restored', message: 'Safe', readAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'unknown', type: 'UNEXPECTED', url: 'https://unsafe.example', title: 'Unknown', message: 'Safe', readAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', body: 'private body' },
    ], pagination: { page: 1, totalPages: 1, total: 4 } };
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /^Ticket update/ })[0]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tickets/ticket-1'));
    expect(hooks.markRead.mutateAsync).toHaveBeenCalledWith('ticket');
    fireEvent.click(screen.getByRole('button', { name: 'Mark Article update as unread' }));
    expect(hooks.markUnread.mutate).toHaveBeenCalledWith('article');
    fireEvent.click(screen.getAllByRole('button', { name: /^Article update/ })[0]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/knowledge/article-1/edit'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Account restored/ })[0]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/profile'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Unknown/ })[0]);
    expect(screen.getByTestId('location')).toHaveTextContent('/profile');
    expect(screen.queryByText('private body')).not.toBeInTheDocument();
  });

  it('uses semantic notification dark-theme surfaces', () => {
    hooks.query.data = { notifications: [{ id: 'n-1', title: 'Safe', message: 'Safe message', readAt: null, createdAt: '2026-09-01T00:00:00.000Z' }], pagination: { page: 1, totalPages: 1, total: 1 } };
    renderPage();
    expect(document.querySelector('.notification-panel')).toBeInTheDocument();
    expect(document.querySelector('.notification-item')).toBeInTheDocument();
  });
});
