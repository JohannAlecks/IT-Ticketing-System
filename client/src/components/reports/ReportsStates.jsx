import { AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';

export function ReportsLoadingState({ heading }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <section className="card p-5 sm:p-6">
        <p className="eyebrow text-brand-700">HelpDesk reports</p>
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="page-subtitle">Loading the latest authorized report…</p>
      </section>
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">Loading report</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="card h-28 animate-pulse bg-slate-100" />)}
        </div>
        <div className="card h-64 animate-pulse bg-slate-100" />
      </div>
    </div>
  );
}

export function ReportsErrorState({ onRetry = () => {}, retrying = false, message = "Couldn't load this report." }) {
  return (
    <section role="alert" aria-live="assertive" className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle aria-hidden="true" className="mb-3 h-8 w-8 text-red-500" />
      <h2 className="text-base font-semibold text-red-800">Report unavailable</h2>
      <p className="mt-1 max-w-md text-sm text-red-700">{message}</p>
      <Button className="mt-5" variant="secondary" size="sm" onClick={onRetry} isLoading={retrying}>
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </section>
  );
}

export function ReportsEmptyState({ message = 'No tickets match the selected range and filters.' }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">{message}</div>;
}
