import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

beforeEach(() => {
  authState.isAuthenticated = true;
  authState.isLoading = false;
  authState.role = 'USER';
});

describe('reports route guard', () => {
  it('redirects an authenticated USER from /reports to /dashboard', async () => {
    render(<MemoryRouter initialEntries={['/reports']}><App /><LocationProbe /></MemoryRouter>);

    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
    expect(screen.queryByRole('heading', { name: 'My Reports' })).not.toBeInTheDocument();
  });
});

