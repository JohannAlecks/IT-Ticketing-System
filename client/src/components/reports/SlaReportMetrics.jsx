function formatCount(value) {
  if (value == null) return 'Not available';
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count.toLocaleString() : 'Not available';
}

function formatPercent(value) {
  if (value == null) return 'Not available';
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 ? `${percent}%` : 'Not available';
}

function MilestoneMetric({ title, metric }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" aria-label={`${title} SLA metrics`}>
      <h3 className="text-sm font-semibold text-slate-800">{title} SLA</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Compliance</dt>
          <dd className="mt-0.5 text-lg font-semibold text-slate-950">{formatPercent(metric?.compliancePercent)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Eligible</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{formatCount(metric?.eligible)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Met</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">{formatCount(metric?.met)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Breached</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-red-700">{formatCount(metric?.breached)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function SlaReportMetrics({ sla }) {
  if (!sla || typeof sla !== 'object') return null;
  const timeModel = sla.timeModel || '24/7 elapsed time';
  return (
    <section className="card p-5" aria-labelledby="reports-sla-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="reports-sla-heading" className="text-base font-semibold text-slate-900">SLA performance</h2>
          <p className="mt-1 text-sm text-slate-500">Server-calculated outcomes for the applied report filters.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">{timeModel}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MilestoneMetric title="First-response" metric={sla.firstResponse} />
        <MilestoneMetric title="Resolution" metric={sla.resolution} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <dt className="text-xs font-medium text-amber-800">Due soon</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-amber-900">{formatCount(sla.dueSoon)}</dd>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <dt className="text-xs font-medium text-red-800">Breached</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-red-900">{formatCount(sla.breached)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-slate-500">Tickets without an applicable SLA are excluded from eligible compliance totals.</p>
    </section>
  );
}
