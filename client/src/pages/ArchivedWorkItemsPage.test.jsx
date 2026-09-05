import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchivedWorkItemsPage from './ArchivedWorkItemsPage';

const hooks = vi.hoisted(() => ({
  filters: null,
  query: { data: { tickets: [], pagination: { page: 1, totalPages: 1, total: 0 } }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: 'ADMIN', user: { id: 'admin-1', name: 'Ada Admin' } }) }));
vi.mock('../hooks/useAgents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('../hooks/useTickets', () => ({
  useTickets: (filters) => {
    hooks.filters = filters;
    return hooks.query;
  },
}));

function renderPage() {
  return render(<MemoryRouter initialEntries={['/tickets/archived']}><ArchivedWorkItemsPage /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  hooks.filters = null;
  hooks.query = { data: { tickets: [], pagination: { page: 1, totalPages: 1, total: 0 } }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
});

describe('ArchivedWorkItemsPage', () => {
  it('requests archived work explicitly and exposes an accessible loading state', () => {
    hooks.query = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() };
    renderPage();

    expect(hooks.filters).toEqual({ page: 1, limit: 15, archive: 'archived' });
    expect(screen.getByRole('status', { name: 'Loading archived work items' })).toBeInTheDocument();
  });

  it('renders an empty state without losing the archive mode when filters are cleared', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'No archived work items' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'vpn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(hooks.filters.archive).toBe('archived');
    screen.getAllByRole('link', { name: 'View active tickets' }).forEach((link) => expect(link).toHaveAttribute('href', '/tickets'));
  });

  it('renders a retryable error state', () => {
    const refetch = vi.fn();
    hooks.query = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch };
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load archived work items.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders archived ticket metadata without exposing email fields', () => {
    hooks.query = {
      data: {
        tickets: [{
          id: 'ticket-12345678',
          title: 'VPN access request',
          status: 'CLOSED',
          priority: 'HIGH',
          category: 'VPN',
          createdBy: { id: 'user-1', name: 'Uma User', email: 'uma@example.test' },
          assignedTo: { id: 'agent-1', name: 'Alex Agent', email: 'alex@example.test' },
          archivedAt: '2026-09-01T10:30:00.000Z',
          archivedBy: { id: 'admin-1', name: 'Ada Admin', email: 'ada@example.test' },
        }],
        pagination: { page: 1, totalPages: 2, total: 16 },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    renderPage();

    expect(screen.getByRole('table', { name: 'Archived work items' })).toBeInTheDocument();
    expect(screen.getByText('#ticket-1')).toBeInTheDocument();
    expect(screen.getByText('VPN access request')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'VPN' })).toBeInTheDocument();
    expect(screen.getByText('Uma User')).toBeInTheDocument();
    expect(screen.getByText('Alex Agent')).toBeInTheDocument();
    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.queryByText('uma@example.test')).not.toBeInTheDocument();
    expect(screen.queryByText('alex@example.test')).not.toBeInTheDocument();
    expect(screen.queryByText('ada@example.test')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
