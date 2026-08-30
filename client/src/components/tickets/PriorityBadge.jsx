const STYLES = {
  LOW: 'border border-slate-200 bg-slate-100 text-slate-600',
  MEDIUM: 'border border-sky-200 bg-sky-50 text-sky-700',
  HIGH: 'border border-orange-200 bg-orange-50 text-orange-700',
  URGENT: 'border border-red-200 bg-red-50 text-red-700',
};

export default function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[priority] || 'border border-slate-200 bg-slate-100 text-slate-600'}`}>
      {priority}
    </span>
  );
}
