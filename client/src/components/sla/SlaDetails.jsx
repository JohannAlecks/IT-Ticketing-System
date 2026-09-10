import { Clock3, PauseCircle } from 'lucide-react';
import SlaBadge from './SlaBadge';
import {
  formatSlaRemaining,
  isSupportRole,
  slaStateLabel,
  useSlaCountdown,
} from '../../hooks/useSla';
import { formatDateTime } from '../../utils/format';

function pendingReasonLabel(reason) {
  if (reason === 'WAITING_FOR_REQUESTER') return 'Waiting for requester';
  if (reason === 'OTHER') return 'Other pending reason';
  return null;
}

function SlaMilestone({ label, milestone, sla, role }) {
  const countdown = useSlaCountdown(milestone || {}, {
    serverNow: sla?.serverNow,
    enabled: true,
  });
  if (!milestone) return null;

  const state = milestone.state;
  const isCountdownState = ['ON_TRACK', 'DUE_SOON', 'BREACHED'].includes(state);
  const outcome = milestone.completedAt
    ? `${slaStateLabel(state)} · completed ${formatDateTime(milestone.completedAt)}`
    : state === 'PAUSED'
      ? `${slaStateLabel(state)} · ${formatSlaRemaining(countdown.remainingSeconds)}`
      : isCountdownState
        ? formatSlaRemaining(countdown.remainingSeconds)
        : slaStateLabel(state);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <SlaBadge sla={sla} milestone={milestone} role={role} />
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Target</dt><dd className="text-right text-slate-700">{formatDateTime(milestone.dueAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="text-right font-medium text-slate-700">{outcome}</dd></div>
        {milestone.paused && <div className="flex items-center justify-end gap-1 text-violet-700"><PauseCircle className="h-3.5 w-3.5" aria-hidden="true" /> Paused until workflow resumes</div>}
      </dl>
    </div>
  );
}

function RequesterSla({ sla }) {
  if (!sla) return null;
  const firstResponse = sla.firstResponse || {};
  return (
    <section className="card p-5" aria-labelledby="requester-sla-heading">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Clock3 className="h-4 w-4" aria-hidden="true" /></div>
        <div>
          <h2 id="requester-sla-heading" className="text-base font-semibold text-slate-900">Support response</h2>
          <p className="mt-1 text-sm text-slate-500">{sla.requesterMessage || (firstResponse.completedAt ? 'Support is currently reviewing this request.' : 'Expected first response by the shown time.')}</p>
        </div>
      </div>
      {firstResponse.completedAt ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">Support responded on {formatDateTime(firstResponse.completedAt)}.</p>
      ) : firstResponse.dueAt ? (
        <p className="mt-4 text-sm font-medium text-slate-700">Expected first response by {formatDateTime(firstResponse.dueAt)}.</p>
      ) : null}
    </section>
  );
}

export default function SlaDetails({ ticket, sla = ticket?.sla, role }) {
  const isStaff = isSupportRole(role);
  const firstResponse = sla?.firstResponse;
  const resolution = sla?.resolution;

  if (!isStaff) return <RequesterSla sla={sla} />;

  const pendingReason = pendingReasonLabel(ticket?.pendingReason ?? sla?.pendingReason);
  if (!sla && !pendingReason) return null;

  return (
    <section className="card space-y-4 p-5" aria-labelledby="sla-details-heading">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Clock3 className="h-4 w-4" aria-hidden="true" /></div>
        <div>
          <h2 id="sla-details-heading" className="text-base font-semibold text-slate-900">SLA details</h2>
          <p className="mt-1 text-sm text-slate-500">Server-calculated targets and outcomes.</p>
        </div>
      </div>

      {sla && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Policy: <strong className="font-semibold text-slate-700">{sla.policyName || 'Configured policy'}</strong></span><span>{sla.timeModel || '24/7 elapsed time'}</span></div>}
      {pendingReason && <p className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800"><PauseCircle className="h-4 w-4" aria-hidden="true" /> {pendingReason}</p>}
      {sla && (
        <div className="space-y-3">
          <SlaMilestone label="First response" milestone={firstResponse} sla={sla} role={role} />
          <SlaMilestone label="Resolution" milestone={resolution} sla={sla} role={role} />
        </div>
      )}
    </section>
  );
}
