import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Header from './Header';

const hooks = vi.hoisted(() => ({ unread: { data: { unreadCount: 0 } } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: 'USER' }, logout: vi.fn() }) }));
vi.mock('../../hooks/useNotifications', () => ({ useUnreadNotificationCount: () => hooks.unread }));
vi.mock('../notifications/NotificationsDropdown', () => ({ default: () => <div>Recent notifications</div> }));

describe('Header notifications bell', () => {
  it('announces unread state and caps the visible badge at 99+', () => {
    hooks.unread = { data: { unreadCount: 130 } };
    render(<MemoryRouter><Header onMenuClick={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Notifications, 130 unread' })).toBeInTheDocument();
    expect(screen.getByText('99+')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 130 unread' }));
    expect(screen.getByText('Recent notifications')).toBeInTheDocument();
  });
});
