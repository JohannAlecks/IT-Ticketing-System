import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import Button from '../ui/Button';

export function DashboardLoadingState({ heading = 'Summary' }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <section className="card p-5 sm:p-6">
        <p className="eyebrow text-brand-700">HelpDesk summary</p>
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="page-subtitle">Loading the latest summary…</p>
      </section>
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">Loading summary</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="card h-28 animate-pulse bg-slate-100" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card h-64 animate-pulse bg-slate-100" />
          <div className="card h-64 animate-pulse bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function DashboardErrorState({ onRetry, retrying = false, message = "Couldn't load your summary." }) {
  return (
    <section role="alert" aria-live="assertive" className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle aria-hidden="true" className="mb-3 h-8 w-8 text-red-500" />
      <h2 className="text-base font-semibold text-red-800">Summary unavailable</h2>
      <p className="mt-1 max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" size="sm" onClick={onRetry} isLoading={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </section>
  );
}

export function DashboardEmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center">
      <CheckCircle2 aria-hidden="true" className="mb-3 h-7 w-7 text-slate-400" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ONBOARDING_COPY = {
  USER: {
    title: 'Finish your setup',
    description: 'Complete your profile and create your first ticket from the workspace guide.',
  },
  AGENT: {
    title: 'Get your work view ready',
    description: 'Review the queue and your assigned work from the workspace guide.',
  },
  ADMIN: {
    title: 'Set up your service desk',
    description: 'Review users, audit activity, and ticket triage from the workspace guide.',
  },
};

export function OnboardingGuidance({ role, onboarding }) {
  const copy = ONBOARDING_COPY[role];
  if (!copy || !onboarding || onboarding.completedAt || onboarding.dismissedAt) return null;

  return (
    <aside className="card flex flex-col gap-4 border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="summary-onboarding-heading">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <p className="eyebrow text-brand-700">Next step</p>
          <h2 id="summary-onboarding-heading" className="mt-1 text-sm font-semibold text-slate-900">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
        </div>
      </div>
      <Link to="/get-started" className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:self-center">
        Open guide <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </aside>
  );
}
