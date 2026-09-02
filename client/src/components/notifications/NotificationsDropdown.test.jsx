import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotificationsDropdown from './NotificationsDropdown';

const hooks = vi.hoisted(() => ({
  recent: { data: { notifications: [] }, isLoading: false, isError: false, refetch: vi.fn() },
  markRead: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  markUnread: { mutate: vi.fn(), isPending: false },
  markAll: { mutate: vi.fn(), isPending: false },
}));
vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => hooks.recent,
  useMarkNotificationRead: () => hooks.markRead,
  useMarkNotificationUnread: () => hooks.markUnread,
  useMarkAllNotificationsRead: () => hooks.markAll,
  notificationDestination: (notice) => notice.type === 'TICKET_PUBLIC_REPLY' && notice.ticketId ? `/tickets/${notice.ticketId}` : null,
}));

function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output>; }
function renderDropdown(onClose = vi.fn()) {
  const bellRef = { current: document.createElement('button') };
  document.body.appendChild(bellRef.current);
  const result = render(<MemoryRouter><NotificationsDropdown onClose={onClose} bellRef={bellRef} /><LocationProbe /></MemoryRouter>);
  return { ...result, onClose, bellRef };
}

afterEach(() => {
  hooks.recent = { data: { notifications: [] }, isLoading: false, isError: false, refetch: vi.fn() };
  hooks.markRead = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
  hooks.markUnread = { mutate: vi.fn(), isPending: false };
  hooks.markAll = { mutate: vi.fn(), isPending: false };
  document.body.innerHTML = '';
});

describe('NotificationsDropdown', () => {
  it('shows loading, empty, and retryable error states', () => {
    hooks.recent = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    const { rerender } = renderDropdown();
    expect(screen.getByLabelText('Loading notifications')).toBeInTheDocument();
    hooks.recent = { data: { notifications: [] }, isLoading: false, isError: false, refetch: vi.fn() };
    rerender(<MemoryRouter><NotificationsDropdown onClose={vi.fn()} bellRef={{ current: document.createElement('button') }} /></MemoryRouter>);
    expect(screen.getByText('You’re all caught up.')).toBeInTheDocument();
    hooks.recent = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    rerender(<MemoryRouter><NotificationsDropdown onClose={vi.fn()} bellRef={{ current: document.createElement('button') }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hooks.recent.refetch).toHaveBeenCalled();
  });

  it('returns focus to the bell on Escape and supports mark read/all', async () => {
    hooks.recent.data = { notifications: [{ id: 'n-1', title: 'New reply', message: 'A response arrived', readAt: null, createdAt: '2026-09-01T00:00:00.000Z' }] };
    const { onClose, bellRef } = renderDropdown();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all read' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(bellRef.current).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Mark New reply as read' }));
    expect(hooks.markRead.mutate).toHaveBeenCalledWith('n-1');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(hooks.markAll.mutate).toHaveBeenCalled();
  });

  it('marks a known target read before navigating and never renders unprojected bodies', async () => {
    hooks.recent.data = { notifications: [{ id: 'n-1', type: 'TICKET_PUBLIC_REPLY', ticketId: 'ticket-1', title: 'New reply', message: 'Safe summary', body: 'internal content must not render', readAt: null, createdAt: '2026-09-01T00:00:00.000Z' }] };
    renderDropdown();
    fireEvent.click(screen.getAllByRole('button', { name: /^New reply/ })[0]);
    await waitFor(() => expect(hooks.markRead.mutateAsync).toHaveBeenCalledWith('n-1'));
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets/ticket-1');
    expect(screen.queryByText('internal content must not render')).not.toBeInTheDocument();
  });
});
