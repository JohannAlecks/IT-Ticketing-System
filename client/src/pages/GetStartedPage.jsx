import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOnboarding, useUpdateOnboarding } from '../hooks/useOnboarding';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';

const STEPS = {
  USER: [{ id: 'profile', title: 'Complete your profile', text: 'Add your department so support has useful context.', to: '/settings' }, { id: 'ticket', title: 'Create a support ticket', text: 'Use categories and impact details to route issues accurately.', to: '/tickets/new' }, { id: 'tickets', title: 'Track your tickets', text: 'Review updates and add comments when needed.', to: '/tickets' }],
  AGENT: [{ id: 'queue', title: 'Review the ticket queue', text: 'Find unassigned or active support work.', to: '/tickets' }, { id: 'work', title: 'Open your workload', text: 'Focus on tickets assigned to you.', to: '/my-tickets' }, { id: 'profile', title: 'Complete your profile', text: 'Keep your department information current.', to: '/settings' }],
  ADMIN: [{ id: 'users', title: 'Review user accounts', text: 'Manage roles and account status safely.', to: '/users' }, { id: 'audit', title: 'Review the audit log', text: 'Monitor security-relevant activity.', to: '/audit-log' }, { id: 'queue', title: 'Review tickets', text: 'Monitor triage and service delivery.', to: '/tickets' }],
};

export default function GetStartedPage() {
  const { role } = useAuth();
  const { data, isLoading } = useOnboarding();
  const update = useUpdateOnboarding();
  if (isLoading) return <Spinner />;
  const steps = STEPS[role] || STEPS.USER;
  const completed = Array.isArray(data?.completedSteps) ? data.completedSteps : [];
  const complete = (id) => update.mutate({ completedSteps: completed.includes(id) ? completed.filter((step) => step !== id) : [...completed, id] });
  const percent = Math.round((completed.length / steps.length) * 100);
  return <div className="mx-auto max-w-3xl space-y-5"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-brand-700">Workspace guide</p><h1 className="page-title">Get started</h1><p className="page-subtitle">A practical checklist for your {role?.toLowerCase()} role. Return anytime.</p></div><Button variant="ghost" size="sm" onClick={() => update.mutate({ dismissed: true })}><X className="h-4 w-4" /> Dismiss</Button></div><section className="card p-5"><div className="mb-2 flex justify-between text-sm font-medium text-slate-700"><span>Your progress</span><span>{completed.length} of {steps.length} complete</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} /></div></section><section className="card divide-y divide-slate-100">{steps.map((step) => { const done = completed.includes(step.id); return <div key={step.id} className="flex gap-4 p-5"><button aria-label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${step.title}`} onClick={() => complete(step.id)} disabled={update.isPending} className="mt-0.5 text-brand-600">{done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</button><div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900">{step.title}</h2><p className="mt-1 text-sm text-slate-500">{step.text}</p><Link className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800" to={step.to}>{done ? 'Review' : 'Open'} →</Link></div></div>; })}</section></div>;
}
