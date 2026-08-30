import { Activity } from 'lucide-react';

function safeCount(value) {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function formatPeriod(value) {
  if (!value) return 'Unknown period';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function TrendEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-800">No trend data</p>
      <p className="mt-1 text-sm text-slate-500">There are no trend points for the selected range.</p>
    </div>
  );
}

export default function ReportTrend({ role, trends }) {
  const points = Array.isArray(trends?.points) ? trends.points : [];
  const admin = role === 'ADMIN';
  const max = Math.max(1, ...points.flatMap((point) => [safeCount(point?.created), safeCount(point?.closed), safeCount(point?.resolved)]));
  const interval = trends?.interval || 'day';
  const title = admin ? 'Ticket volume trend' : 'Resolution trend';
  const description = admin
    ? `Created and closed tickets grouped by ${interval}. Exact values are shown with every bar.`
    : `Tickets resolved by you grouped by ${interval}. Exact values are shown with every bar.`;

  return (
    <section className="card min-w-0 p-5" aria-labelledby="reports-trend-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Activity aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <h2 id="reports-trend-heading" className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      {points.length === 0 ? <TrendEmpty /> : (
        <>
          <p className="sr-only" id="reports-trend-summary">
            {admin ? 'Each point includes created and closed ticket totals.' : 'Each point includes the resolved ticket total.'}
          </p>
          <ul className="space-y-4" aria-describedby="reports-trend-summary">
            {points.map((point, index) => {
              const period = formatPeriod(point?.periodStart);
              const created = safeCount(point?.created);
              const closed = safeCount(point?.closed);
              const resolved = safeCount(point?.resolved);
              const values = admin ? [['Created', created, 'bg-brand-500'], ['Closed', closed, 'bg-emerald-500']] : [['Resolved', resolved, 'bg-brand-500']];
              return (
                <li key={`${point?.periodStart || 'period'}-${index}`}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{period}</span>
                    <span className="text-xs text-slate-500">{interval}</span>
                  </div>
                  <div className="space-y-2">
                    {values.map(([label, value, color]) => (
                      <div key={label}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-600">{label}</span>
                          <span className="font-semibold tabular-nums text-slate-900">{value}</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`${label} on ${period}: ${value}`}
                          aria-valuemin={0}
                          aria-valuemax={max}
                          aria-valuenow={value}
                          className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                        >
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

