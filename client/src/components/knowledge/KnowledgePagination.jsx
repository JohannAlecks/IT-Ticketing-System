import Button from '../ui/Button';

export default function KnowledgePagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <nav aria-label="Knowledge page navigation" className="flex flex-wrap items-center justify-between gap-3 py-3">
    <p className="text-sm text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} articles</p>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</Button>
      <Button variant="secondary" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</Button>
    </div>
  </nav>;
}
