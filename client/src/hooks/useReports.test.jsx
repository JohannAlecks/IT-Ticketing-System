import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportSummary, useReportTickets } from './useReports';
import { protectedQueryKeys } from '../query/protectedCache';

const authState = vi.hoisted(() => ({ user: { id: 'account-a' }, role: 'AGENT' }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../api/reports.api', () => ({
  reportsApi: {
    getSummary: vi.fn(),
    getTickets: vi.fn(),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  authState.user = { id: 'account-a' };
  authState.role = 'AGENT';
  const { reportsApi } = await import('../api/reports.api');
  vi.clearAllMocks();
  reportsApi.getSummary.mockResolvedValue({ role: 'AGENT', metrics: {} });
  reportsApi.getTickets.mockResolvedValue({ rows: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } });
});

describe('useReports', () => {
  it('uses the stable account id, normalized summary filters, and forwards AbortSignal', async () => {
    const { reportsApi } = await import('../api/reports.api');
    let receivedSignal;
    reportsApi.getSummary.mockImplementation((params, signal) => {
      receivedSignal = signal;
      return Promise.resolve({ role: 'AGENT', params });
    });
    const client = makeClient();
    const filters = { from: ' 2026-08-01 ', to: '2026-08-30', status: 'open', search: '  printer  ', interval: 'DAY', workBlocking: 'ALL', page: 4, limit: 20, sortOrder: 'ASC' };

    const { result } = renderHook(() => useReportSummary(filters), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data?.params).toBeDefined());
    const normalized = {
      from: '2026-08-01',
      to: '2026-08-30',
      status: 'OPEN',
      workBlocking: 'all',
      interval: 'day',
      search: 'printer',
    };
    expect(reportsApi.getSummary).toHaveBeenCalledWith(normalized, expect.any(AbortSignal));
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(client.getQueryData([...protectedQueryKeys.reports('account-a'), 'AGENT', 'summary', normalized])).toEqual({ role: 'AGENT', params: normalized });
    expect(client.getQueryCache().find({ queryKey: protectedQueryKeys.reports('account-a'), exact: false })).toBeDefined();
  });

  it('keeps ticket pagination and filters in a separate protected query key', async () => {
    const { reportsApi } = await import('../api/reports.api');
    const client = makeClient();
    const filters = { from: '2026-08-01', to: '2026-08-30', page: 2, limit: 15, sortOrder: 'desc', workBlocking: 'no' };

    const { result } = renderHook(() => useReportTickets(filters), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const normalized = { from: '2026-08-01', to: '2026-08-30', workBlocking: 'no', interval: 'day', page: 2, limit: 15, sortOrder: 'desc' };
    expect(reportsApi.getTickets).toHaveBeenCalledWith(normalized, expect.any(AbortSignal));
    expect(client.getQueryData([...protectedQueryKeys.reports('account-a'), 'AGENT', 'tickets', normalized])).toEqual({ rows: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } });
  });

  it('does not enable report requests for a USER', async () => {
    authState.role = 'USER';
    const { reportsApi } = await import('../api/reports.api');
    const client = makeClient();
    const { result } = renderHook(() => useReportSummary({ from: '2026-08-01', to: '2026-08-30' }), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(reportsApi.getSummary).not.toHaveBeenCalled();
  });

  it('does not expose broader ticket placeholder data after a role change', async () => {
    const { reportsApi } = await import('../api/reports.api');
    const client = makeClient();
    authState.role = 'ADMIN';
    reportsApi.getTickets
      .mockResolvedValueOnce({ rows: [{ id: 'admin-visible' }], pagination: { page: 1, limit: 15, total: 1, totalPages: 1 } })
      .mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(
      () => useReportTickets({ page: 1, limit: 15 }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.data?.rows?.[0]?.id).toBe('admin-visible'));

    authState.role = 'AGENT';
    rerender();

    expect(result.current.data).toBeUndefined();
  });
});
