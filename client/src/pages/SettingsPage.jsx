import { useEffect, useRef, useState } from 'react';
import PersonalShortcuts from '../components/personal/PersonalShortcuts';
import { Bell, Save } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ProfilePanel, AppearancePanel, SecurityPanel, ApplicationPanel } from '../components/settings/AccountPanels';
import AccountDialog from '../components/ui/AccountDialog';
import Select from '../components/ui/Select';
import { useAuth } from '../context/AuthContext';
import { NOTIFICATION_PREFERENCE_KEYS, useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/useNotifications';
import Button from '../components/ui/Button';
import SlaPolicySettings from '../components/sla/SlaPolicySettings';

function Section({ icon: Icon, title, description, className = '', children }) {
  return <section className={`card p-5 ${className}`}><div className="mb-5 flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></div><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{description}</p></div></div>{children}</section>;
}

const NOTIFICATION_GROUPS = [
  {
    title: 'Ticket activity',
    options: [
      { key: 'ticketWatchedUpdates', label: 'Updates to tickets I watch', description: 'Future public updates to authorized tickets you follow. Internal notes are never included.' },
    ],
  },
  { title: 'Ticket assignments', options: [
      { key: 'ticketAssigned', label: 'Ticket assigned', description: 'A ticket is assigned to you.', roles: ['AGENT', 'ADMIN'] },
      { key: 'ticketUnassigned', label: 'Ticket unassigned', description: 'A ticket is unassigned from you.', roles: ['AGENT', 'ADMIN'] },
    ],
  },
  { title: 'Ticket status and public replies', options: [
      { key: 'ticketStatusChanged', label: 'Ticket status changed', description: 'A ticket you are involved with changes status.' },
      { key: 'ticketPublicReply', label: 'Ticket public reply', description: 'A public reply is added to a ticket you are involved with.' },
      { key: 'ticketWorkBlocking', label: 'Ticket work blocking', description: 'A ticket is marked as work-blocking.', roles: ['ADMIN'] },
    ],
  },
  {
    title: 'SLA escalation',
    options: [
      { key: 'slaDueSoon', label: 'SLA due soon', description: 'Optional alerts when assigned support work is approaching its SLA target.', roles: ['AGENT', 'ADMIN'] },
      { key: 'slaBreached', label: 'SLA breached', description: 'Breach alerts are required for support staff and cannot be turned off.', roles: ['AGENT', 'ADMIN'], mandatory: true },
    ],
  },
  {
    title: 'Knowledge Base',
    options: [
      { key: 'knowledgeSubmitted', label: 'Knowledge submitted', description: 'A knowledge article is submitted for review.', roles: ['ADMIN'] },
      { key: 'knowledgePublished', label: 'Knowledge published', description: 'A knowledge article is published.', roles: ['AGENT', 'ADMIN'] },
      { key: 'knowledgeReturned', label: 'Knowledge returned', description: 'A knowledge article is returned for changes.', roles: ['AGENT', 'ADMIN'] },
    ],
  },
  {
    title: 'Account activity',
    options: [
      { key: 'accountReactivated', label: 'Account reactivated', description: 'Account reactivation alerts protect account integrity and cannot be turned off.', mandatory: true },
    ],
  },
];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function preferenceValues(data) {
  return data?.preferences && typeof data.preferences === 'object' ? data.preferences : {};
}

function changedNotificationPreferences(baseline, draft) {
  return Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS
    .filter((key) => hasOwn(baseline, key) && hasOwn(draft, key))
    .filter((key) => typeof baseline[key] === 'boolean' && typeof draft[key] === 'boolean')
    .filter((key) => baseline[key] !== draft[key])
    .map((key) => [key, draft[key]]));
}

function NotificationPreferenceToggle({ preference, value, onChange, disabled }) {
  const inputId = `notification-preference-${preference.key}`;
  const descriptionId = `${inputId}-description`;
  const isMandatory = preference.mandatory;
  return <label className="notification-preference-row flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 px-4 py-3 transition hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-75">
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
        <span>{preference.label}</span>
        {isMandatory && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Always enabled</span>}
      </span>
      <span id={descriptionId} className="mt-1 block text-sm leading-5 text-slate-500">{preference.description}</span>
    </span>
    <span className="relative flex h-6 w-11 shrink-0 items-center">
      <input
        id={inputId}
        type="checkbox"
        className="notification-toggle-input peer sr-only"
        checked={isMandatory ? true : !!value}
        disabled={disabled || isMandatory}
        onChange={(event) => onChange(preference.key, event.target.checked)}
        aria-label={preference.label}
        aria-describedby={descriptionId}
      />
      <span aria-hidden="true" className="notification-toggle-track absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-60" />
      <span aria-hidden="true" className="notification-toggle-thumb pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-disabled:bg-slate-100" />
    </span>
  </label>;
}

function NotificationPreferencesSection() {
  const { user, role } = useAuth();
  const preferencesQuery = useNotificationPreferences();
  const preferencesMutation = useUpdateNotificationPreferences();
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  const identity = user?.id ? `${user.id}:${normalizedRole}` : '';
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loadedIdentity, setLoadedIdentity] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const lastIdentity = useRef(identity);
  const appliedData = useRef({ identity: null, data: null });
  const activeIdentity = useRef(identity);
  const saveInFlight = useRef(false);
  activeIdentity.current = identity;

  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    appliedData.current = { identity: null, data: null };
    setDraft(null);
    setBaseline(null);
    setLoadedIdentity(null);
    setFeedback(null);
  }, [identity]);

  useEffect(() => {
    if (!identity || !preferencesQuery.data) return;
    if (appliedData.current.identity === identity && appliedData.current.data === preferencesQuery.data) return;
    appliedData.current = { identity, data: preferencesQuery.data };
    const nextPreferences = preferenceValues(preferencesQuery.data);
    setBaseline(nextPreferences);
    setDraft((current) => Object.fromEntries(Object.entries(nextPreferences).map(([key, value]) => [key, loadedIdentity === identity && current && baseline && current[key] !== baseline[key] ? current[key] : value])));
    setLoadedIdentity(identity);
  }, [identity, preferencesQuery.data]);

  const ready = !!identity && loadedIdentity === identity && !!draft && !!baseline && !!preferencesQuery.data;
  const loading = !preferencesQuery.isError && (
    preferencesQuery.isPending || preferencesQuery.isLoading || (preferencesQuery.isFetching && !preferencesQuery.data) || !ready
  );
  const loadError = preferencesQuery.isError && !ready;
  const serverPreferences = preferenceValues(preferencesQuery.data);
  const mandatory = new Set(Array.isArray(preferencesQuery.data?.mandatory) ? preferencesQuery.data.mandatory : []);
  const visibleGroups = NOTIFICATION_GROUPS
    .map((group) => ({ ...group, options: group.options.filter((option) => hasOwn(serverPreferences, option.key) && (!option.roles || option.roles.includes(normalizedRole))) }))
    .filter((group) => group.options.length > 0);
  const changes = ready ? changedNotificationPreferences(baseline, draft) : {};
  const isDirty = Object.keys(changes).length > 0;
  const saving = preferencesMutation.isPending || feedback?.type === 'saving';

  const handleToggle = (key, value) => {
    if (!ready || saving) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!ready || !isDirty || saving || saveInFlight.current) return;
    const payload = changedNotificationPreferences(baseline, draft);
    if (!Object.keys(payload).length) return;
    const saveIdentity = identity;
    saveInFlight.current = true;
    setFeedback({ type: 'saving', message: 'Saving notification preferences…' });
    try {
      await preferencesMutation.mutateAsync(payload);
      if (activeIdentity.current === saveIdentity) {
        setFeedback({ type: 'success', message: 'Notification preferences saved.' });
      }
    } catch (error) {
      if (activeIdentity.current === saveIdentity) {
        setFeedback({
          type: 'error',
          message: error?.response?.data?.message || 'Could not save notification preferences. Your changes are still here. Please try again.',
        });
      }
    } finally {
      saveInFlight.current = false;
    }
  };

  let content;
  if (loading) {
    content = <div className="notification-preferences-loading rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-600" role="status" aria-live="polite"><span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 align-[-2px]" aria-hidden="true" />Loading notification preferences…</div>;
  } else if (loadError) {
    content = <div className="notification-feedback-error flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>We couldn’t load notification preferences. Please try again.</span><Button type="button" variant="secondary" size="sm" onClick={() => preferencesQuery.refetch?.()}>Retry</Button></div>;
  } else {
    content = <>
      {preferencesQuery.isError && <div className="notification-feedback-error mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>We couldn’t refresh notification preferences.</span><Button type="button" variant="secondary" size="sm" onClick={() => preferencesQuery.refetch?.()}>Retry</Button></div>}
      {visibleGroups.length ? <div className="space-y-5">{visibleGroups.map((group) => <div key={group.title}><h3 className="mb-2 text-sm font-semibold text-slate-800">{group.title}</h3><div className="space-y-2">{group.options.map((preference) => <NotificationPreferenceToggle key={preference.key} preference={{ ...preference, mandatory: preference.mandatory || mandatory.has(preference.key) }} value={draft[preference.key]} onChange={handleToggle} disabled={saving} />)}</div></div>)}</div> : <p className="notification-preferences-empty rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-600">No configurable notification preferences are available for this account.</p>}
    </>;
  }

  return <Section icon={Bell} title="Notifications" description="Choose which in-app events should notify you." className="lg:col-span-2">
    <div className="space-y-5" aria-busy={saving}>
      <p className="text-sm text-slate-600">These preferences control future in-app notifications. Existing notifications are not removed.</p>
      <p className="text-sm text-slate-500">Email notification controls are unavailable here. These settings do not send email.</p>
      {ready && <div className="flex flex-wrap gap-2">{[[true, 'Enable all optional'], [false, 'Disable all optional']].map(([value, label]) => <Button key={label} variant="secondary" disabled={saving} onClick={() => { const keys = visibleGroups.flatMap((group) => group.options).filter((option) => !option.mandatory && !mandatory.has(option.key)).map((option) => option.key); setDraft((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, value])) })); setFeedback(null); }}>{label}</Button>)}</div>}
      {content}
      <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-sm" aria-live="polite">
          {feedback?.type === 'saving' && <span className="notification-feedback-saving text-slate-600" role="status">{feedback.message}</span>}
          {feedback?.type === 'success' && <span className="notification-feedback-success text-emerald-700" role="status">{feedback.message}</span>}
          {feedback?.type === 'error' && <span className="notification-feedback-error-text text-red-700" role="alert">{feedback.message}</span>}
        </div>
        <Button type="button" onClick={handleSave} disabled={!ready || !isDirty || saving} isLoading={saving} aria-busy={saving}>
          <Save className="h-4 w-4" /> Save notification preferences
        </Button>
      </div>
    </div>
  </Section>;
}

function SettingsLayout() {
  const { role } = useAuth(); const [params, setParams] = useSearchParams(); const location = useLocation();
  const [dirty, setDirty] = useState(false); const [pendingSection, setPendingSection] = useState(null);
  const sections = [['profile', 'Profile'], ['appearance', 'Appearance'], ['notifications', 'Notifications'], ['shortcuts', 'Shortcuts'], ['security', 'Security'], ...(role === 'ADMIN' ? [['application', 'Application settings'], ['sla', 'SLA policies']] : [])];
  const requested = params.get('section') || (location.hash === '#sla-policies' ? 'sla' : 'profile');
  const section = sections.some(([key]) => key === requested) ? requested : 'profile';
  const change = (next) => { const query = new URLSearchParams(params); query.set('section', next); setParams(query); };
  const navigate = (next) => { if (next === section) return; if (dirty) setPendingSection(next); else change(next); };
  useEffect(() => {
    if (!dirty) return;
    const unload = (event) => { event.preventDefault(); event.returnValue = ''; };
    const link = (event) => { const anchor = event.target.closest?.('a[href]'); if (anchor && !window.confirm('Discard your unsaved profile changes?')) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', link, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', link, true); };
  }, [dirty]);
  return <div className="mx-auto max-w-6xl space-y-5"><header><p className="eyebrow text-brand-700">Your workspace</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage your identity, preferences, and account security.</p></header>
    <div className="md:hidden"><Select label="Settings section" value={section} onChange={(e) => navigate(e.target.value)}>{sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
    <div className="grid min-w-0 gap-5 md:grid-cols-[210px_minmax(0,1fr)]"><nav aria-label="Settings sections" className="card hidden h-fit space-y-1 p-2 md:block">{sections.map(([key, label]) => <button key={key} onClick={() => navigate(key)} aria-current={section === key ? 'page' : undefined} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium ${section === key ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</nav>
      <div className="min-w-0">{section === 'profile' && <ProfilePanel onDirtyChange={setDirty} />}{section === 'appearance' && <AppearancePanel />}{section === 'notifications' && <NotificationPreferencesSection />}{section === 'shortcuts' && <PersonalShortcuts />}{section === 'security' && <SecurityPanel />}{role === 'ADMIN' && section === 'application' && <ApplicationPanel />}{role === 'ADMIN' && section === 'sla' && <SlaPolicySettings />}</div>
    </div>
    {pendingSection && <AccountDialog title="Discard profile changes?" onClose={() => setPendingSection(null)}><p>Your unsaved name and department edits will be lost.</p><div className="mt-5 flex gap-3"><Button variant="secondary" onClick={() => setPendingSection(null)}>Keep editing</Button><Button onClick={() => { setDirty(false); change(pendingSection); setPendingSection(null); }}>Discard and continue</Button></div></AccountDialog>}
  </div>;
}
export default function SettingsPage() {
  const { user, role } = useAuth();
  return user?.id ? <SettingsLayout key={`${user.id}:${role}`} /> : null;
}
