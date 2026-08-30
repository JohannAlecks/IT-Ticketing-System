import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardSummary } from './useDashboard';
import { protectedQueryKeys } from '../query/protectedCache';

const authState = vi.hoisted(() => ({ user: { id: 'account-a' } }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../api/dashboard.api', () => ({
  dashboardApi: {
    getSummary: vi.fn(),
    getStats: vi.fn(),
    getAgentWorkload: vi.fn(),
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
  const { dashboardApi } = await import('../api/dashboard.api');
  vi.clearAllMocks();
  dashboardApi.getSummary.mockResolvedValue({ role: 'USER' });
});

describe('useDashboardSummary', () => {
  it('uses the account-scoped dashboard key and forwards TanStack Query AbortSignal', async () => {
    const { dashboardApi } = await import('../api/dashboard.api');
    let receivedSignal;
    dashboardApi.getSummary.mockImplementation((signal) => {
      receivedSignal = signal;
      return Promise.resolve({ role: 'USER', metrics: {} });
    });
    const client = makeClient();

    const { result } = renderHook(() => useDashboardSummary(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data?.role).toBe('USER'));
    expect(dashboardApi.getSummary).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(client.getQueryData(protectedQueryKeys.dashboard('account-a'))).toEqual({ role: 'USER', metrics: {} });
    expect(client.getQueryCache().find({ queryKey: protectedQueryKeys.dashboard('account-a'), exact: true })).toBeDefined();
  });

  it('creates a separate protected cache entry when the account changes', async () => {
    const { dashboardApi } = await import('../api/dashboard.api');
    dashboardApi.getSummary.mockImplementation((signal) => Promise.resolve({ role: 'USER', account: signal ? 'loaded' : 'missing' }));
    const client = makeClient();
    const { rerender } = renderHook(() => useDashboardSummary(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(client.getQueryData(protectedQueryKeys.dashboard('account-a'))).toBeDefined());
    authState.user = { id: 'account-b' };
    rerender();
    await waitFor(() => expect(client.getQueryData(protectedQueryKeys.dashboard('account-b'))).toBeDefined());

    expect(client.getQueryCache().find({ queryKey: protectedQueryKeys.dashboard('account-a'), exact: true })).toBeDefined();
    expect(client.getQueryCache().find({ queryKey: protectedQueryKeys.dashboard('account-b'), exact: true })).toBeDefined();
    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(2);
  });

  it('aborts the summary request when the protected query is cancelled', async () => {
    const { dashboardApi } = await import('../api/dashboard.api');
    let receivedSignal;
    dashboardApi.getSummary.mockImplementation((signal) => {
      receivedSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const client = makeClient();
    renderHook(() => useDashboardSummary(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(receivedSignal).toBeDefined());
    await client.cancelQueries({ queryKey: protectedQueryKeys.dashboard('account-a') });
    await waitFor(() => expect(receivedSignal.aborted).toBe(true));
  });
});
