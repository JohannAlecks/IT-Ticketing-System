import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slaApi } from '../api/sla.api';
import {
  remainingAt,
  useSlaCountdown,
  useSlaPolicies,
} from './useSla';

const authState = vi.hoisted(() => ({ user: null, role: null }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../api/sla.api', () => ({ slaApi: { listPolicies: vi.fn(), updatePolicy: vi.fn() } }));

function queryWrapper(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-09T12:00:00.000Z') });
  setVisibility('visible');
  authState.user = null;
  authState.role = null;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  setVisibility('visible');
  vi.useRealTimers();
});

describe('SLA countdown presentation', () => {
  it('anchors countdown elapsed time to local receipt instead of server wall-clock time', () => {
    const receipt = Date.parse('2026-09-09T12:00:00.000Z');
    const skewedServerNow = '2026-09-09T11:55:00.000Z';

    expect(remainingAt(receipt, skewedServerNow, 120, receipt)).toBe(120);
    expect(remainingAt(receipt + 30_000, skewedServerNow, 120, receipt)).toBe(90);
  });

  it('ticks visible incomplete milestones while preserving the server state', () => {
    const { result } = renderHook(() => useSlaCountdown({
      state: 'ON_TRACK',
      remainingSeconds: 120,
      dueAt: '2026-09-09T12:02:00.000Z',
    }, { serverNow: '2026-09-09T11:55:00.000Z', interval: 30_000 }));

    expect(result.current.remainingSeconds).toBe(120);
    expect(result.current.state).toBe('ON_TRACK');
    expect(result.current.isRunning).toBe(true);
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.remainingSeconds).toBe(90);
    expect(result.current.state).toBe('ON_TRACK');
  });

  it('stops while hidden and resumes only after the document becomes visible', () => {
    setVisibility('hidden');
    const { result } = renderHook(() => useSlaCountdown({ state: 'DUE_SOON', remainingSeconds: 120 }, { interval: 30_000 }));

    expect(result.current.isRunning).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.remainingSeconds).toBe(120);

    act(() => setVisibility('visible'));
    expect(result.current.isRunning).toBe(true);
    act(() => vi.advanceTimersByTime(30_000));
    // Rendering pauses while hidden, not the server's SLA elapsed clock.
    expect(result.current.remainingSeconds).toBe(30);
  });

  it('does not tick a paused milestone even when the server state is breached', () => {
    const { result } = renderHook(() => useSlaCountdown({
      state: 'BREACHED',
      remainingSeconds: -30,
      paused: true,
    }, { interval: 30_000 }));

    expect(result.current.isRunning).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.remainingSeconds).toBe(-30);
    expect(result.current.state).toBe('BREACHED');
  });
});

describe('SLA policy query access', () => {
  beforeEach(() => vi.useRealTimers());
  it('loads policies only for an Admin and passes TanStack Query cancellation', async () => {
    authState.user = { id: 'admin-1' };
    authState.role = 'ADMIN';
    slaApi.listPolicies.mockResolvedValue({ policies: [], timeModel: '24/7 elapsed time' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSlaPolicies(), { wrapper: queryWrapper(client) });

    await waitFor(() => expect(result.current.data?.timeModel).toBe('24/7 elapsed time'));
    expect(slaApi.listPolicies).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('does not request policy data for a non-Admin', async () => {
    authState.user = { id: 'agent-1' };
    authState.role = 'AGENT';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useSlaPolicies(), { wrapper: queryWrapper(client) });
    await Promise.resolve();
    expect(slaApi.listPolicies).not.toHaveBeenCalled();
  });
});
