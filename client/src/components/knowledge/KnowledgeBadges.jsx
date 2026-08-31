export function StatusBadge({ status }) {
  const label = String(status || 'DRAFT').replaceAll('_', ' ');
  const styles = {
    DRAFT: 'bg-slate-100 text-slate-700',
    IN_REVIEW: 'bg-amber-100 text-amber-800',
    PUBLISHED: 'bg-emerald-100 text-emerald-800',
    ARCHIVED: 'bg-slate-200 text-slate-700',
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status] || styles.DRAFT}`}>Status: {label}</span>;
}

export function VisibilityBadge({ visibility, showInternal = false }) {
  if (visibility !== 'INTERNAL' || !showInternal) return null;
  return <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Internal article</span>;
}

export function TagList({ tags = [] }) {
  if (!tags?.length) return null;
  return <ul className="flex flex-wrap gap-1.5" aria-label="Article tags">
    {tags.map((tag) => <li key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{tag}</li>)}
  </ul>;
}

export function formatKnowledgeDate(date) {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? null : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}
