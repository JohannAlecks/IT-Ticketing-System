import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUpdateTicket } from './useTickets';
import { protectedQueryKeys } from '../query/protectedCache';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'account-a' } }) }));
vi.mock('../api/tickets.api', () => ({ ticketsApi: { update: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

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
});
