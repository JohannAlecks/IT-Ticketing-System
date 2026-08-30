const TONE_CLASSES = {
  brand: 'bg-brand-50 text-brand-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  slate: 'bg-slate-100 text-slate-700',
};

export default function MetricCard({ label, value, icon: Icon, tone = 'brand' }) {
  const displayValue = typeof value === 'number' && !Number.isFinite(value) ? 0 : value ?? 0;

  return (
    <article className="card min-w-0 p-4 transition-shadow hover:shadow-md" aria-label={`${label}: ${displayValue}`}>
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE_CLASSES[tone] || TONE_CLASSES.brand}`}>
        {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
      </div>
      <p className="truncate text-2xl font-semibold tracking-tight text-slate-950">{displayValue}</p>
      <h3 className="mt-0.5 text-xs font-medium text-slate-500">{label}</h3>
    </article>
  );
}
