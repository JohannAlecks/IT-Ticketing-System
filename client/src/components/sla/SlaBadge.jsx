import { AlertTriangle, CheckCircle2, CircleOff, Clock3, PauseCircle, TimerReset } from 'lucide-react';
import {
  formatSlaRemaining,
  getSlaState,
  isSupportRole,
  slaStateLabel,
  useSlaCountdown,
} from '../../hooks/useSla';

const STATE_STYLES = {
  NOT_APPLICABLE: 'border border-slate-200 bg-slate-100 text-slate-700',
  ON_TRACK: 'border border-blue-200 bg-blue-50 text-blue-700',
  DUE_SOON: 'border border-amber-200 bg-amber-50 text-amber-800',
  BREACHED: 'border border-red-200 bg-red-50 text-red-700',
  PAUSED: 'border border-violet-200 bg-violet-50 text-violet-700',
  MET: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  COMPLETED_BREACHED: 'border border-orange-200 bg-orange-50 text-orange-800',
};

const STATE_ICONS = {
  NOT_APPLICABLE: CircleOff,
  ON_TRACK: Clock3,
  DUE_SOON: TimerReset,
  BREACHED: AlertTriangle,
  PAUSED: PauseCircle,
  MET: CheckCircle2,
  COMPLETED_BREACHED: AlertTriangle,
};

function milestoneFor(sla, state) {
  if (!sla) return null;
  const milestones = [sla.firstResponse, sla.resolution].filter(Boolean);
  return milestones.find((milestone) => milestone.state === state)
    || milestones.find((milestone) => ['BREACHED', 'DUE_SOON', 'PAUSED', 'ON_TRACK'].includes(milestone.state))
    || milestones[0]
    || null;
}

export function getSlaBadgeState(sla, milestone) {
  return milestone?.state || getSlaState(sla);
}

export default function SlaBadge({
  sla,
  milestone,
  role,
  label,
  showCountdown = false,
  className = '',
}) {
  const state = getSlaBadgeState(sla, milestone);
  const selectedMilestone = milestone || milestoneFor(sla, state);
  const countdown = useSlaCountdown(selectedMilestone || {}, {
    serverNow: sla?.serverNow,
    enabled: showCountdown,
  });
  const canRender = isSupportRole(role);

  if (!canRender || !state) return null;

  const Icon = STATE_ICONS[state] || Clock3;
  const stateText = slaStateLabel(state);
  const countdownText = showCountdown && ['ON_TRACK', 'DUE_SOON', 'BREACHED'].includes(state)
    ? formatSlaRemaining(countdown.remainingSeconds)
    : null;
  const accessibleLabel = [label || 'SLA', stateText, countdownText].filter(Boolean).join(': ');

  return (
    <span
      className={`sla-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLES[state] || STATE_STYLES.NOT_APPLICABLE} ${className}`}
      data-sla-state={state}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label ? `${label}: ` : ''}{stateText}</span>
      {countdownText && <span className="font-normal">· {countdownText}</span>}
    </span>
  );
}
