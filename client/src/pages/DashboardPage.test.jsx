import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

const authState = vi.hoisted(() => ({ role: 'USER', user: { id: 'user-1', name: 'Test User' } }));
const summaryQuery = vi.hoisted(() => ({
  data: undefined,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../hooks/useDashboard', () => ({ useDashboardSummary: () => summaryQuery }));

const definitions = {
  activeStatuses: ['OPEN', 'IN_PROGRESS', 'PENDING'],
  terminalStatuses: ['RESOLVED', 'CLOSED'],
};

function ticket(id, title, overrides = {}) {
  return { id, title, status: 'OPEN', priority: 'HIGH', createdAt: '2026-08-30T00:00:00.000Z', ...overrides };
}

function summaryFor(role, overrides = {}) {
  return {
    role,
    generatedAt: '2026-08-30T00:00:00.000Z',
    windowDays: 7,
    definitions,
    metrics: {
      active: 2,
      workBlocking: 1,
      recentlyCreated: 3,
      recentlyClosed: 4,
      assignedActive: 5,
      assignedWorkBlocking: 1,
      eligibleUnassigned: 2,
      recentlyUpdatedAssigned: 3,
      recentlyClosedByMe: 4,
      totalTickets: 10,
      activeTickets: 8,
      unassignedActive: 2,
      workBlockingActive: 1,
      activeAgents: 3,
      inactiveUsers: 1,
    },
    distributions: {
      byStatus: { OPEN: 2, IN_PROGRESS: 1, PENDING: 1, RESOLVED: 1, CLOSED: 1 },
      byCategory: { HARDWARE: 2, SOFTWARE: 1 },
      byDepartment: { FINANCE: 2, ENGINEERING: 1 },
      byPriority: { URGENT: 99 },
    },
    lists: {
      active: [ticket('user-private', 'User private ticket')],
      recent: [ticket('user-recent', 'User recent ticket')],
      recentClosed: [ticket('user-closed', 'User closed ticket', { status: 'CLOSED', priority: 'LOW' })],
      priorityQueue: [ticket('agent-priority', 'Agent priority ticket', { priority: 'URGENT' })],
      unassigned: [ticket('agent-unassigned', 'Agent unassigned ticket')],
      recentlyUpdated: [ticket('agent-updated', 'Agent updated ticket')],
      workload: [{ agent: { id: 'agent-1', name: 'Agent One' }, total: 2, byStatus: { OPEN: 1, PENDING: 1 } }],
      recentAudit: [{ id: 'audit-1', eventType: 'ticket.updated', entityType: 'ticket', entityId: 'ticket-1', createdAt: '2026-08-30T00:00:00.000Z', actor: { id: 'actor-1', name: 'Admin One', email: 'private@example.test' } }],
    },
    onboarding: { completedSteps: [], dismissedAt: null, completedAt: null },
    operations: { emailDeliveryConfigured: true },
    ...overrides,
  };
}

function renderDashboard(summary, role = summary.role) {
  authState.role = role;
  authState.user = { id: `${role.toLowerCase()}-1`, name: 'Test User' };
  summaryQuery.data = summary;
  summaryQuery.isLoading = false;
  summaryQuery.isError = false;
  summaryQuery.isFetching = false;
  summaryQuery.refetch = vi.fn();
  return render(<MemoryRouter initialEntries={['/dashboard']}><DashboardPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  summaryQuery.data = undefined;
  summaryQuery.isLoading = false;
  summaryQuery.isError = false;
  summaryQuery.isFetching = false;
  summaryQuery.refetch = vi.fn();
});

afterEach(() => cleanup());

describe('DashboardPage role summaries', () => {
  it.each([
    ['USER', 'My Summary', 'User private ticket', 'Agent priority ticket', 'System status'],
    ['AGENT', 'My Work Summary', 'Agent priority ticket', 'User private ticket', 'System status'],
    ['ADMIN', 'System Summary', 'Agent priority ticket', 'User private ticket', 'My assigned tickets by status'],
  ])('renders only the %s summary surface and keeps other-role data out of the page', (role, heading, visibleTicket, hiddenTicket, hiddenHeading) => {
    renderDashboard(summaryFor(role));

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByText(visibleTicket)).toBeInTheDocument();
    expect(screen.queryByText(hiddenTicket)).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: hiddenHeading })).not.toBeInTheDocument();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
  });

  it('keeps each role action links on existing routes', () => {
    const first = renderDashboard(summaryFor('USER'));
    expect(screen.getByRole('link', { name: 'Create ticket' })).toHaveAttribute('href', '/tickets/new');
    screen.getAllByRole('link', { name: 'View tickets' }).forEach((link) => expect(link).toHaveAttribute('href', '/tickets'));
    first.unmount();

    const second = renderDashboard(summaryFor('AGENT'));
    expect(screen.getByRole('link', { name: 'Assigned queue' })).toHaveAttribute('href', '/my-tickets');
    expect(screen.getByRole('link', { name: 'All tickets' })).toHaveAttribute('href', '/tickets');
    expect(screen.getByRole('link', { name: 'Create ticket' })).toHaveAttribute('href', '/tickets/new');
    second.unmount();

    renderDashboard(summaryFor('ADMIN'));
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute('href', '/audit-log');
    expect(screen.getByRole('link', { name: 'Create ticket' })).toHaveAttribute('href', '/tickets/new');
  });

  it('labels admin workload totals as active assigned tickets', () => {
    renderDashboard(summaryFor('ADMIN'));

    expect(screen.getByText('Active assigned ticket totals by support agent.')).toBeInTheDocument();
    expect(screen.getByText('2 active assigned tickets')).toBeInTheDocument();
  });

  it('shows onboarding guidance only while onboarding is neither completed nor dismissed', () => {
    const { unmount } = renderDashboard(summaryFor('USER'));
    expect(screen.getByRole('link', { name: /open guide/i })).toHaveAttribute('href', '/get-started');
    unmount();

    renderDashboard(summaryFor('USER', { onboarding: { completedSteps: ['profile'], dismissedAt: null, completedAt: '2026-08-30T00:00:00.000Z' } }));
    expect(screen.queryByRole('link', { name: /open guide/i })).not.toBeInTheDocument();
  });

  it('renders zero distributions and empty lists without NaN values', () => {
    renderDashboard(summaryFor('USER', {
      metrics: { active: 0, workBlocking: 0, recentlyCreated: 0, recentlyClosed: 0 },
      distributions: { byStatus: { OPEN: 0, IN_PROGRESS: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 } },
      lists: { active: [], recent: [], recentClosed: [] },
      onboarding: { completedSteps: [], dismissedAt: '2026-08-30T00:00:00.000Z', completedAt: null },
    }));

    expect(screen.getByText('No active tickets')).toBeInTheDocument();
    expect(screen.getByText('No recent tickets')).toBeInTheDocument();
    expect(screen.getByText('No closed tickets in this window')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open guide/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    screen.getAllByRole('progressbar').forEach((bar) => expect(bar).toHaveAttribute('aria-valuenow', '0'));
  });

  it('renders a role=alert error state whose retry action refetches the summary', () => {
    summaryQuery.data = undefined;
    summaryQuery.isError = true;
    const retry = vi.fn();
    summaryQuery.refetch = retry;
    authState.role = 'USER';
    authState.user = { id: 'user-1', name: 'Test User' };
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('Summary unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
