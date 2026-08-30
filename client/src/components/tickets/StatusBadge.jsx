const STYLES = {
  OPEN: 'border border-blue-200 bg-blue-50 text-blue-700',
  IN_PROGRESS: 'border border-amber-200 bg-amber-50 text-amber-800',
  PENDING: 'border border-violet-200 bg-violet-50 text-violet-700',
  RESOLVED: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  CLOSED: 'border border-slate-200 bg-slate-100 text-slate-600',
};

const LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status] || 'border border-slate-200 bg-slate-100 text-slate-600'}`}>
      {LABELS[status] || status}
    </span>
  );
}
