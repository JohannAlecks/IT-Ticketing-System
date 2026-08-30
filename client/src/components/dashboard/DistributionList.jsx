import { DashboardEmptyState } from './DashboardStates';

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const BAR_COLORS = ['bg-brand-500', 'bg-blue-500', 'bg-amber-500', 'bg-violet-500', 'bg-emerald-500', 'bg-slate-500'];

export function formatDistributionLabel(value) {
  const text = String(value ?? '').replace(/[_.-]+/g, ' ').trim();
  if (!text) return 'Unknown';
  return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeCount(value) {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function distributionEntries(distribution) {
  if (Array.isArray(distribution)) {
    return distribution.flatMap((entry) => {
      if (Array.isArray(entry)) return entry.length > 0 ? [[entry[0], entry[1]]] : [];
      if (!entry || typeof entry !== 'object') return [];
      const key = entry.key ?? entry.label ?? entry.name;
      return key == null ? [] : [[key, entry.count ?? entry.total ?? 0]];
    });
  }
  if (!distribution || typeof distribution !== 'object') return [];
  return Object.entries(distribution);
}

export default function DistributionList({
  id,
  title,
  description,
  distribution,
  order,
  labelMap = {},
  emptyTitle = 'No distribution data',
  emptyDescription = 'There is no distribution data to show yet.',
}) {
  const sourceEntries = distributionEntries(distribution);
  const source = new Map(sourceEntries.map(([key, value]) => [String(key), value]));
  const entries = Array.isArray(order) && order.length > 0
    ? order.map((key) => [String(key), source.get(String(key)) ?? 0])
    : sourceEntries;
  const normalizedEntries = entries.map(([key, value]) => ({
    key: String(key),
    count: safeCount(value),
  }));
  const total = normalizedEntries.reduce((sum, entry) => sum + entry.count, 0);
  const headingId = id || undefined;

  return (
    <section className="card min-w-0 p-5" aria-labelledby={headingId} aria-label={headingId ? undefined : title}>
      <div className="mb-4">
        <h2 id={headingId} className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {normalizedEntries.length === 0 ? (
        <DashboardEmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <ul className="space-y-3" aria-label={`${title} values`}>
            {normalizedEntries.map(({ key, count }, index) => {
              const label = labelMap[key] || STATUS_LABELS[key] || formatDistributionLabel(key);
              const percentage = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
              const maximum = total > 0 ? total : 1;
              return (
                <li key={key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-700">{label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{count}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${label}: ${count} of ${total}`}
                    aria-valuemin={0}
                    aria-valuemax={maximum}
                    aria-valuenow={count}
                    aria-valuetext={`${count} ${label.toLowerCase()} ${percentage}%`}
                    className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  >
                    <div className={`h-full rounded-full transition-all ${BAR_COLORS[index % BAR_COLORS.length]}`} style={{ width: `${percentage}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {total === 0 && <p className="mt-4 text-sm text-slate-500">No tickets in this summary window.</p>}
        </>
      )}
    </section>
  );
}
