import { useEffect, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slaApi } from '../api/sla.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

export const SLA_STATES = Object.freeze([
  'NOT_APPLICABLE',
  'ON_TRACK',
  'DUE_SOON',
  'BREACHED',
  'PAUSED',
  'MET',
  'COMPLETED_BREACHED',
]);

export const SLA_FILTER_STATES = Object.freeze(['ON_TRACK', 'DUE_SOON', 'BREACHED', 'PAUSED']);

export const SLA_STATE_LABELS = Object.freeze({
  NOT_APPLICABLE: 'Not applicable',
  ON_TRACK: 'On track',
  DUE_SOON: 'Due soon',
  BREACHED: 'Breached',
  PAUSED: 'Paused',
  MET: 'Met',
  COMPLETED_BREACHED: 'Completed breached',
});

const AGGREGATE_STATE_PRIORITY = ['BREACHED', 'DUE_SOON', 'PAUSED', 'ON_TRACK'];
const DISPLAY_COUNTDOWN_STATES = new Set(['ON_TRACK', 'DUE_SOON', 'BREACHED']);

export function isSupportRole(role) {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'AGENT' || normalized === 'ADMIN';
}

export function isKnownSlaState(state) {
  return SLA_STATES.includes(state);
}

export function getSlaMilestone(sla, kind) {
  if (!sla || !['firstResponse', 'resolution'].includes(kind)) return null;
  return sla[kind] || null;
}

/**
 * Derive only the display aggregate from server-provided milestone states.
 * The client never compares dueAt/remainingSeconds with its own clock to
 * manufacture a new SLA state.
 */
export function getSlaState(sla) {
  const states = [sla?.firstResponse?.state, sla?.resolution?.state]
    .filter(isKnownSlaState);
  if (!states.length) return null;

  for (const state of AGGREGATE_STATE_PRIORITY) {
    if (states.includes(state)) return state;
  }
  if (states.includes('COMPLETED_BREACHED')) return 'COMPLETED_BREACHED';
  if (states.includes('MET')) return 'MET';
  if (states.includes('NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return null;
}

export function slaStateLabel(state) {
  return SLA_STATE_LABELS[state] || 'SLA status unavailable';
}

function finiteSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function parseServerNow(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Calculate a presentation-only countdown from a server snapshot. The
 * optional local receipt timestamp is the clock anchor used by the hook; this
 * prevents a client whose wall clock is skewed from changing the snapshot's
 * remaining time immediately after it is received. The returned value may be
 * negative for an overdue milestone.
 */
export function remainingAt(now, serverNow, remainingSeconds, snapshotReceivedAt = null) {
  const baseline = finiteSeconds(remainingSeconds);
  if (baseline == null) return null;
  const anchor = snapshotReceivedAt ?? serverNow;
  const anchorTimestamp = typeof anchor === 'number' ? anchor : parseServerNow(anchor);
  if (anchorTimestamp == null || !Number.isFinite(Number(now))) return baseline;
  const elapsedSeconds = Math.max(0, Math.floor((Number(now) - anchorTimestamp) / 1000));
  return baseline - elapsedSeconds;
}

export function formatSlaDuration(seconds) {
  const value = Math.max(0, Math.trunc(Number(seconds)));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainderSeconds = value % 60;
  if (minutes < 60) return remainderSeconds ? `${minutes}m ${String(remainderSeconds).padStart(2, '0')}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours < 24) return remainderMinutes ? `${hours}h ${String(remainderMinutes).padStart(2, '0')}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours ? `${days}d ${remainderHours}h` : `${days}d`;
}

export function formatSlaRemaining(seconds) {
  const value = finiteSeconds(seconds);
  if (value == null) return 'Remaining time unavailable';
  if (value < 0) return `Overdue by ${formatSlaDuration(Math.abs(value))}`;
  if (value === 0) return 'Due now';
  return `${formatSlaDuration(value)} remaining`;
}

function useDocumentVisible() {
  const [isVisible, setIsVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleVisibilityChange();
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
}

function resolveCountdownArgs(source, kindOrOptions, maybeOptions) {
  if (typeof kindOrOptions === 'string') {
    const options = maybeOptions || {};
    const milestone = source?.firstResponse || source?.resolution
      ? getSlaMilestone(source, kindOrOptions)
      : source;
    return { milestone, serverNow: options.serverNow || source?.serverNow, options };
  }

  const options = kindOrOptions || {};
  const milestone = options.milestone || source?.milestone || source;
  return { milestone, serverNow: options.serverNow || source?.serverNow, options };
}

/**
 * Presentation-only countdown for one server-calculated milestone.
 *
 * The hook ticks only while the document is visible and the server state is an
 * incomplete countdown state. Paused, completed, and not-applicable milestones
 * stay fixed. A server refresh should replace the source object; no local tick
 * changes the authoritative state.
 */
export function useSlaCountdown(source, kindOrOptions = 'firstResponse', maybeOptions = {}) {
  const { milestone, serverNow, options } = resolveCountdownArgs(source, kindOrOptions, maybeOptions);
  const enabled = options.enabled !== false;
  const interval = Number.isFinite(Number(options.interval)) && Number(options.interval) > 0
    ? Number(options.interval)
    : 30_000;
  const isVisible = useDocumentVisible();
  const [localNow, setLocalNow] = useState(() => Date.now());
  const state = milestone?.state;
  const baseline = finiteSeconds(milestone?.remainingSeconds);
  const snapshotSignature = [
    serverNow,
    state,
    milestone?.dueAt,
    milestone?.completedAt,
    milestone?.paused,
    baseline,
  ].map((value) => String(value ?? '')).join('|');
  const snapshotRef = useRef(null);
  if (!snapshotRef.current || snapshotRef.current.signature !== snapshotSignature) {
    snapshotRef.current = { signature: snapshotSignature, receivedAt: Date.now() };
  }
  const snapshotReceivedAt = snapshotRef.current.receivedAt;
  const shouldTick = enabled && isVisible && !milestone?.paused && DISPLAY_COUNTDOWN_STATES.has(state) && baseline != null;

  useEffect(() => {
    if (!shouldTick) return undefined;
    setLocalNow(Date.now());
    const timer = setInterval(() => setLocalNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [shouldTick, interval, snapshotSignature]);

  const remainingSeconds = useMemo(() => (
    DISPLAY_COUNTDOWN_STATES.has(state)
      ? remainingAt(localNow, serverNow, baseline, snapshotReceivedAt)
      : baseline
  ), [localNow, serverNow, baseline, snapshotReceivedAt, state]);

  return {
    remainingSeconds,
    state: isKnownSlaState(state) ? state : null,
    dueAt: milestone?.dueAt || null,
    completedAt: milestone?.completedAt || null,
    paused: Boolean(milestone?.paused),
    isVisible,
    isRunning: shouldTick,
  };
}

export const useVisibilityAwareSlaCountdown = useSlaCountdown;

export function useSlaPolicies() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  return useQuery({
    queryKey: protectedQueryKeys.slaPolicies(userId, normalizedRole),
    queryFn: ({ signal }) => slaApi.listPolicies(signal),
    enabled: !!userId && normalizedRole === 'ADMIN',
    refetchOnWindowFocus: true,
  });
}

function policyMutationInput(input = {}) {
  const id = input.id || input.policyId;
  const payload = input.payload || Object.fromEntries(
    ['version', 'firstResponseMinutes', 'resolutionMinutes', 'dueSoonMinutes', 'isActive']
      .filter((key) => Object.prototype.hasOwnProperty.call(input, key))
      .map((key) => [key, input[key]])
  );
  return { id, payload };
}

export function useUpdateSlaPolicy() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  const activeIdentity = useRef({ userId, role: normalizedRole });
  activeIdentity.current = { userId, role: normalizedRole };
  const queryKey = protectedQueryKeys.slaPolicies(userId, normalizedRole);

  return useMutation({
    mutationKey: protectedMutationKeys.slaPolicy(userId, normalizedRole),
    mutationFn: (input) => {
      const { id, payload } = policyMutationInput(input);
      return slaApi.updatePolicy(id, payload);
    },
    onSuccess: (policy) => {
      const identity = activeIdentity.current;
      if (identity.userId !== userId || identity.role !== normalizedRole || !policy) return;
      // Logout cancels/removes protected queries but cannot cancel a mutation
      // already accepted by the server. Never recreate a cleared policy cache.
      if (!queryClient.getQueryState(queryKey)) return;
      queryClient.setQueryData(queryKey, (current) => {
        if (!current) return current;
        const policies = Array.isArray(current.policies) ? current.policies : [];
        if (policies.some((item) => item.id === policy.id && item.version > policy.version)) return current;
        const found = policies.some((item) => item.id === policy.id);
        return { ...current, policies: found ? policies.map((item) => item.id === policy.id ? policy : item) : [...policies, policy] };
      });
    },
  });
}
