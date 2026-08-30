import { Users } from 'lucide-react';
import { DashboardEmptyState } from './DashboardStates';
import { formatDistributionLabel } from './DistributionList';

function safeCount(value) {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export default function AdminWorkload({ workload }) {
  const rows = Array.isArray(workload) ? workload : [];

  return (
    <section className="card min-w-0 p-5" aria-labelledby="admin-workload-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Users aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <h2 id="admin-workload-heading" className="text-base font-semibold text-slate-900">Agent workload</h2>
          <p className="mt-1 text-sm text-slate-500">Active assigned ticket totals by support agent.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <DashboardEmptyState title="No agent workload yet" description="No active support agents are available." />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Agent workload rows">
          {rows.map((row, index) => {
            const total = safeCount(row.total);
            const statusEntries = row.byStatus && typeof row.byStatus === 'object' ? Object.entries(row.byStatus).map(([key, value]) => ({ key, count: safeCount(value) })).filter(({ count }) => count > 0) : [];
            return (
              <li key={row.agent?.id || index} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-slate-800">{row.agent?.name || 'Unnamed agent'}</h3>
                  <span className="shrink-0 text-xs font-medium text-slate-500">{total} active assigned ticket{total === 1 ? '' : 's'}</span>
                </div>
                {statusEntries.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${row.agent?.name || 'Agent'} status breakdown`}>
                    {statusEntries.map(({ key, count }) => <li key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{formatDistributionLabel(key)}: {count}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No tickets assigned</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
