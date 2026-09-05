import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useArchiveTicket, useTickets, useUpdateTicket } from './useTickets';
import { protectedQueryKeys } from '../query/protectedCache';

const authState = vi.hoisted(() => ({ user: { id: 'account-a' }, role: undefined }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../api/tickets.api', () => ({ ticketsApi: { list: vi.fn(), update: vi.fn(), archive: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

beforeEach(async () => {
  authState.user = { id: 'account-a' };
  authState.role = undefined;
  const { ticketsApi } = await import('../api/tickets.api');
  vi.clearAllMocks();
  ticketsApi.list.mockResolvedValue({ tickets: [], pagination: { page: 1, totalPages: 1, total: 0 } });
});

function wrapperFor(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ticket query ownership', () => {
  it('forwards an explicit archive mode and separates active and archived query entries', async () => {
    const { ticketsApi } = await import('../api/tickets.api');
    authState.role = 'AGENT';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderHook(({ archive }) => useTickets({ page: 1, limit: 15, archive }), {
      initialProps: { archive: 'active' },
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(ticketsApi.list).toHaveBeenCalledWith({ page: 1, limit: 15, archive: 'active' }, expect.any(AbortSignal)));
    rerender({ archive: 'archived' });
    await waitFor(() => expect(ticketsApi.list).toHaveBeenCalledWith({ page: 1, limit: 15, archive: 'archived' }, expect.any(AbortSignal)));

    expect(client.getQueryData([...protectedQueryKeys.tickets('account-a', 'AGENT', 'active'), { page: 1, limit: 15, archive: 'active' }])).toEqual({ tickets: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    expect(client.getQueryData([...protectedQueryKeys.tickets('account-a', 'AGENT', 'archived'), { page: 1, limit: 15, archive: 'archived' }])).toEqual({ tickets: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  });

  it('isolates ticket entries when the same account changes role', async () => {
    const { ticketsApi } = await import('../api/tickets.api');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    authState.role = 'AGENT';
    const { rerender } = renderHook(() => useTickets({ page: 1, limit: 15, archive: 'active' }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(ticketsApi.list).toHaveBeenCalledTimes(1));
    authState.role = 'ADMIN';
    rerender();
    await waitFor(() => expect(ticketsApi.list).toHaveBeenCalledTimes(2));

    expect(client.getQueryCache().find({ queryKey: [...protectedQueryKeys.tickets('account-a', 'AGENT', 'active'), { page: 1, limit: 15, archive: 'active' }], exact: true })).toBeDefined();
    expect(client.getQueryCache().find({ queryKey: [...protectedQueryKeys.tickets('account-a', 'ADMIN', 'active'), { page: 1, limit: 15, archive: 'active' }], exact: true })).toBeDefined();
  });
});

describe('ticket conflict handling', () => {
  it('refreshes ticket, list, and dashboard state after a 409 conflict', async () => {
    const { ticketsApi } = await import('../api/tickets.api');
    ticketsApi.update.mockRejectedValue({ response: { status: 409 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTicket('ticket-1'), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });

    result.current.mutate({ status: 'OPEN' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.ticket('account-a', 'ticket-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.tickets('account-a') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.dashboard('account-a') });
  });

  it('invalidates current-account active and archived projections after archiving', async () => {
    const { ticketsApi } = await import('../api/tickets.api');
    authState.role = 'ADMIN';
    ticketsApi.archive.mockResolvedValue({ id: 'ticket-1', archivedAt: '2026-09-02T00:00:00.000Z' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useArchiveTicket('ticket-1'), { wrapper: wrapperFor(client) });

    result.current.mutate();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(6));

    expect(ticketsApi.archive).toHaveBeenCalledWith('ticket-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.tickets('account-a', 'ADMIN', 'active') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.tickets('account-a', 'ADMIN', 'archived') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.ticket('account-a', 'ticket-1', 'ADMIN') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.dashboard('account-a') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.workload('account-a') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: protectedQueryKeys.reports('account-a') });
  });
});
