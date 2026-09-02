import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  role: 'USER',
  user: { id: 'user-1', name: 'Test User' },
}));

vi.mock('./context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('./hooks/useDashboard', () => ({
  useDashboardSummary: () => ({
    data: {
      role: 'USER',
      metrics: { active: 0, workBlocking: 0, recentlyCreated: 0, recentlyClosed: 0 },
      distributions: { byStatus: {} },
      lists: { active: [], recent: [], recentClosed: [] },
      onboarding: { completedSteps: [], dismissedAt: '2026-08-30T00:00:00.000Z', completedAt: null },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('./hooks/useNotifications', () => ({
  useUnreadNotificationCount: () => ({ data: { unreadCount: 0 } }),
  useNotifications: () => ({ data: { notifications: [], pagination: { page: 1, totalPages: 1, total: 0 } }, isLoading: false, isError: false, refetch: vi.fn() }),
  useMarkNotificationRead: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMarkNotificationUnread: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn(), isPending: false }),
  NOTIFICATION_TYPES: [],
  notificationDestination: () => null,
}));
vi.mock('./components/notifications/NotificationsDropdown', () => ({ default: () => null }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

beforeEach(() => {
  authState.isAuthenticated = true;
  authState.isLoading = false;
  authState.role = 'USER';
});

afterEach(cleanup);

describe('reports route guard', () => {
  it('redirects an authenticated USER from /reports to /dashboard', async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/reports']}><App /><LocationProbe /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
    expect(screen.queryByRole('heading', { name: 'My Reports' })).not.toBeInTheDocument();
  });

  it('redirects an authenticated USER from Knowledge management while keeping reading routes available', async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/knowledge/manage']}><App /><LocationProbe /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('keeps notifications available to authenticated users', async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/notifications']}><App /><LocationProbe /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByTestId('location')).toHaveTextContent('/notifications');
  });
});
