import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsPage, { getQuickRange } from './ReportsPage';

const authState = vi.hoisted(() => ({ role: 'AGENT', user: { id: 'agent-1', name: 'Avery Agent' } }));
const reportsState = vi.hoisted(() => ({
  summaryQuery: {},
  ticketsQuery: {},
  observedFilters: [],
}));
const exportMock = vi.hoisted(() => vi.fn());

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../hooks/useReports', async () => {
  const actual = await vi.importActual('../hooks/useReports');
  return {
    ...actual,
    useReports: (filters) => {
      reportsState.observedFilters.push(filters);
      return { summaryQuery: reportsState.summaryQuery, ticketsQuery: reportsState.ticketsQuery };
    },
  };
});
vi.mock('../api/reports.api', () => ({
  reportsApi: { exportTickets: exportMock },
  sanitizeReportFilename: (value) => value || 'authorized-report.csv',
}));

const agentSummary = {
  role: 'AGENT',
  generatedAt: '2026-08-30T10:20:00.000Z',
  timezone: 'UTC',
  range: { from: '2026-08-01', to: '2026-08-30', toExclusive: '2026-08-31', days: 30, boundary: 'inclusive' },
  filters: { from: '2026-08-01', to: '2026-08-30', workBlocking: 'all', interval: 'day' },
  metrics: { assignedDuring: 12, resolvedByMe: 8, activeAssigned: 4, workBlockingActive: 1, reopened: 2, averageResolutionHours: null },
  metricNotes: { averageResolutionHours: 'Not returned by the service for this test range.' },
  trends: { interval: 'day', points: [{ periodStart: '2026-08-30', resolved: 8 }] },
  distributions: { byStatus: { OPEN: 2, RESOLVED: 8 }, byCategory: { SOFTWARE: 6, HARDWARE: 4 } },
};

const adminSummary = {
  ...agentSummary,
  role: 'ADMIN',
  metrics: { created: 20, closed: 15, active: 9, workBlocking: 2, reopened: 3, unassignedActive: 1, averageResolutionHours: null },
  trends: { interval: 'day', points: [{ periodStart: '2026-08-30', created: 20, closed: 15 }] },
  distributions: { byStatus: { OPEN: 5, CLOSED: 15 }, byCategory: { SOFTWARE: 10 }, byPriority: { HIGH: 7 }, byDepartment: { Engineering: 12 } },
  filterOptions: { agents: [{ id: 'agent-1', name: 'Avery Agent' }], departments: ['Engineering'] },
  agentActivity: {
    currentWorkload: [{ agent: { id: 'agent-1', name: 'Avery Agent' }, activeAssigned: 4 }],
    resolutionActivity: [{ periodStart: '2026-08-30', resolved: 15 }],
  },
};

const ticketRows = [{
  id: 'ticket-123456',
  title: 'Replace a failed monitor',
  status: 'OPEN',
  category: 'HARDWARE',
  priority: 'HIGH',
  isWorkBlocking: true,
  createdAt: '2026-08-29T00:00:00.000Z',
  closedAt: null,
  assignedAgent: { id: 'agent-1', name: 'Avery Agent' },
  requesterDepartment: 'Engineering',
}];

function queryFor(data, overrides = {}) {
  return { data, isLoading: false, isPending: false, isError: false, isFetching: false, refetch: vi.fn(), ...overrides };
}

function renderPage(summary = agentSummary, role = summary.role, ticketData = { rows: ticketRows, pagination: { page: 1, limit: 15, total: 16, totalPages: 2, sortOrder: 'desc' } }) {
  authState.role = role;
  authState.user = { id: `${role.toLowerCase()}-1`, name: 'Avery Agent' };
  reportsState.summaryQuery = queryFor(summary);
  reportsState.ticketsQuery = queryFor(ticketData);
  return render(<MemoryRouter initialEntries={['/reports']}><ReportsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  reportsState.observedFilters = [];
  exportMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ReportsPage', () => {
  it('renders the Agent page without admin filters or operational data', () => {
    renderPage(agentSummary, 'AGENT');

    expect(screen.getByRole('heading', { name: 'My Reports' })).toBeInTheDocument();
    expect(screen.getByText(/Timezone: UTC/)).toBeInTheDocument();
    expect(screen.getByText(/Last generated:/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Service desk operations' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agent operational context' })).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Resolved by me: 8' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Resolved on Aug 30, 2026: 8' })).toBeInTheDocument();
  });

  it('renders the Admin heading, filter options, admin distributions, and operations', () => {
    renderPage(adminSummary, 'ADMIN');

    expect(screen.getByRole('heading', { name: 'Service Desk Reports' })).toBeInTheDocument();
    expect(screen.getByLabelText('Agent')).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Service desk operations' })).toBeInTheDocument();
    expect(screen.getByText('Tickets by priority')).toBeInTheDocument();
    expect(screen.getByText('Tickets by department')).toBeInTheDocument();
    expect(screen.getByText(/complexity and reassignment history/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Requester department' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Assigned agent' })).toBeInTheDocument();
  });

  it('shows the UTC default 30-day range and quick ranges apply normalized dates', () => {
    renderPage();

    const defaultRange = getQuickRange(30);
    expect(screen.getByLabelText('From date')).toHaveValue(defaultRange.from);
    expect(screen.getByLabelText('To date')).toHaveValue(defaultRange.to);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));

    const quickRange = getQuickRange(7);
    expect(screen.getByLabelText('From date')).toHaveValue(quickRange.from);
    expect(screen.getByLabelText('To date')).toHaveValue(quickRange.to);
    const last = reportsState.observedFilters.at(-1);
    expect(last.from).toBe(quickRange.from);
    expect(last.to).toBe(quickRange.to);
    expect(last.page).toBe(1);
  });

  it('rejects invalid, reversed, and overlong custom ranges without applying them', () => {
    renderPage();
    const initialCallCount = reportsState.observedFilters.length;

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-08-31' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be on or before');
    expect(reportsState.observedFilters.at(-1).from).toBe('2026-08-01');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-08-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('366 calendar days or fewer');
    expect(reportsState.observedFilters.at(-1).from).toBe('2026-08-01');
    expect(reportsState.observedFilters.length).toBeGreaterThanOrEqual(initialCallCount);
  });

  it('applies search only after Apply and Reset restores the 30-day defaults', () => {
    renderPage();
    const initialCount = reportsState.observedFilters.length;
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'monitor' } });
    expect(reportsState.observedFilters.slice(initialCount).every((filters) => !filters.search)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(reportsState.observedFilters.at(-1).search).toBe('monitor');
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(reportsState.observedFilters.at(-1).search).toBeUndefined();
    expect(screen.getByLabelText('From date')).toHaveValue(getQuickRange(30).from);
  });

  it('preserves committed filters through pagination and resets the page on Apply', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'monitor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(reportsState.observedFilters.at(-1).search).toBe('monitor');
    expect(reportsState.observedFilters.at(-1).page).toBe(2);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'adapter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(reportsState.observedFilters.at(-1).search).toBe('adapter');
    expect(reportsState.observedFilters.at(-1).page).toBe(1);
  });

  it('announces loading, empty, and retryable API error states', () => {
    const view = renderPage(agentSummary, 'AGENT', { rows: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } });
    expect(screen.getByText('No tickets match the selected range and filters.')).toBeInTheDocument();
    view.unmount();

    reportsState.summaryQuery = queryFor(undefined, { data: undefined, isLoading: true });
    reportsState.ticketsQuery = queryFor(undefined, { data: undefined, isLoading: true });
    authState.role = 'AGENT';
    authState.user = { id: 'agent-1', name: 'Avery Agent' };
    render(<MemoryRouter initialEntries={['/reports']}><ReportsPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading report');
    cleanup();

    reportsState.summaryQuery = queryFor(undefined, { data: undefined, isError: true });
    reportsState.ticketsQuery = queryFor(undefined, { data: undefined, isError: true });
    authState.role = 'AGENT';
    authState.user = { id: 'agent-1', name: 'Avery Agent' };
    render(<MemoryRouter initialEntries={['/reports']}><ReportsPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Report unavailable');
  });

  it('exports committed authorized filters, disables while loading, and revokes the object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let resolveExport;
    exportMock.mockImplementation(() => new Promise((resolve) => { resolveExport = resolve; }));
    renderPage();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'monitor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export authorized report CSV' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export authorized report CSV' })).toBeDisabled());
    expect(exportMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'monitor' }));
    expect(exportMock.mock.calls[0][0]).not.toHaveProperty('page');
    resolveExport({ blob: new Blob(['id,title\n1,Monitor']), filename: 'report.csv' });
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:report'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('renders a retryable export failure and keeps the action available', async () => {
    exportMock.mockRejectedValue(new Error('Download failed'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Export authorized report CSV' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Download failed'));
    expect(screen.getByRole('button', { name: 'Export authorized report CSV' })).not.toBeDisabled();
  });

  it('includes both desktop semantic table and mobile card structures', () => {
    renderPage(adminSummary, 'ADMIN');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Detailed report ticket cards')).toBeInTheDocument();
    expect(screen.getByLabelText('Detailed report ticket cards').className).toContain('md:hidden');
    expect(screen.getByRole('table').parentElement.className).toContain('hidden');
  });
});
