import { BriefcaseBusiness, Gauge, Users } from 'lucide-react';

function safeCount(value) {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function asRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([key, item]) => (item && typeof item === 'object' ? { key, ...item } : { key, count: item }));
}

function rowName(row) {
  return row?.agent?.name || row?.agentName || row?.name || row?.label || row?.department || row?.key || 'Unspecified';
}

function workloadValue(row) {
  return safeCount(row?.activeAssigned ?? row?.active ?? row?.total ?? row?.workload ?? row?.count);
}

function resolutionValue(row) {
  return safeCount(row?.resolved ?? row?.closed ?? row?.resolutionCount ?? row?.count);
}

function OperationsEmpty({ message }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">{message}</p>;
}

function AgentOperations({ metrics }) {
  const signals = [
    ['Active assigned', metrics?.activeAssigned],
    ['Work-blocking active', metrics?.workBlockingActive],
    ['Reopened', metrics?.reopened],
  ];
  return (
    <section className="card min-w-0 p-5" aria-labelledby="reports-agent-operations-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <BriefcaseBusiness aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <h2 id="reports-agent-operations-heading" className="text-base font-semibold text-slate-900">Agent operational context</h2>
          <p className="mt-1 text-sm text-slate-500">Your assigned-work signals; active counts are current snapshots and reopened follows the selected range.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {signals.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-900">{safeCount(value)}</p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">These counts are scoped to your account by the server and do not include other agents.</p>
    </section>
  );
}

function AdminOperations({ activity }) {
  const workload = asRows(activity?.currentWorkload);
  const resolution = asRows(activity?.resolutionActivity);
  return (
    <section className="card min-w-0 p-5" aria-labelledby="reports-admin-operations-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Gauge aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <h2 id="reports-admin-operations-heading" className="text-base font-semibold text-slate-900">Service desk operations</h2>
          <p className="mt-1 text-sm text-slate-500">Current workload and recorded resolution activity.</p>
        </div>
      </div>
      <p className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
        These operational counts describe assignments and recorded resolutions. Ticket complexity and reassignment history limit direct comparisons.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Users aria-hidden="true" className="h-4 w-4 text-violet-600" /> Current workload</h3>
          {workload.length === 0 ? <OperationsEmpty message="No current workload data for this range." /> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Current workload values">
              {workload.map((row, index) => <li key={`${row?.agent?.id || row?.key || rowName(row)}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><span className="truncate text-slate-700">{rowName(row)}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{workloadValue(row)}</span></li>)}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><BriefcaseBusiness aria-hidden="true" className="h-4 w-4 text-violet-600" /> Resolution activity</h3>
          {resolution.length === 0 ? <OperationsEmpty message="No resolution activity for this range." /> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Resolution activity values">
              {resolution.map((row, index) => <li key={`${row?.periodStart || row?.key || rowName(row)}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><span className="truncate text-slate-700">{row?.periodStart || rowName(row) || 'Unspecified'}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{resolutionValue(row)}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function ReportOperations({ role, summary }) {
  if (role === 'ADMIN') return <AdminOperations activity={summary?.agentActivity} />;
  if (role === 'AGENT') return <AgentOperations metrics={summary?.metrics} />;
  return null;
}
