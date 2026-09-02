import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Eye, EyeOff, Save, UserRound } from 'lucide-react';
import { settingsApi } from '../api/settings.api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NOTIFICATION_PREFERENCE_KEYS, useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/useNotifications';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

function Section({ icon: Icon, title, description, className = '', children }) {
  return <section className={`card p-5 ${className}`}><div className="mb-5 flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></div><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{description}</p></div></div>{children}</section>;
}

function PasswordField({ label, value, onChange, autoComplete, helperText }) {
  const [visible, setVisible] = useState(false);
  return <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label><div className="relative"><input className="input pr-11" type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required /><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}</div>;
}

const NOTIFICATION_GROUPS = [
  {
    title: 'Ticket activity',
    options: [
      { key: 'ticketAssigned', label: 'Ticket assigned', description: 'A ticket is assigned to you.' },
      { key: 'ticketUnassigned', label: 'Ticket unassigned', description: 'A ticket is unassigned from you.' },
      { key: 'ticketStatusChanged', label: 'Ticket status changed', description: 'A ticket you are involved with changes status.' },
      { key: 'ticketPublicReply', label: 'Ticket public reply', description: 'A public reply is added to a ticket you are involved with.' },
      { key: 'ticketWorkBlocking', label: 'Ticket work blocking', description: 'A ticket is marked as work-blocking.' },
    ],
  },
  {
    title: 'Knowledge Base',
    options: [
      { key: 'knowledgeSubmitted', label: 'Knowledge submitted', description: 'A knowledge article is submitted for review.' },
      { key: 'knowledgePublished', label: 'Knowledge published', description: 'A knowledge article is published.' },
      { key: 'knowledgeReturned', label: 'Knowledge returned', description: 'A knowledge article is returned for changes.' },
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
    setDraft(nextPreferences);
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
    .map((group) => ({ ...group, options: group.options.filter((option) => hasOwn(serverPreferences, option.key)) }))
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

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user?.name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const saveProfile = async (event) => { event.preventDefault(); setSavingProfile(true); try { updateUser(await settingsApi.updateProfile({ name, department: department.trim() || null })); toast.success('Profile updated'); } catch (error) { toast.error(error.response?.data?.message || 'Could not update your profile'); } finally { setSavingProfile(false); } };
  const savePassword = async (event) => { event.preventDefault(); if (passwords.newPassword !== passwords.confirmPassword) return toast.error('New passwords do not match'); setSavingPassword(true); try { await settingsApi.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); toast.success('Password updated'); } catch (error) { toast.error(error.response?.data?.message || 'Could not change your password'); } finally { setSavingPassword(false); } };
  const rules = [['At least 8 characters', passwords.newPassword.length >= 8], ['1 uppercase letter', /[A-Z]/.test(passwords.newPassword)], ['1 lowercase letter', /[a-z]/.test(passwords.newPassword)], ['1 number', /\d/.test(passwords.newPassword)], ['1 special character', /[^A-Za-z0-9]/.test(passwords.newPassword)]];
  const passwordValid = rules.every(([, valid]) => valid) && passwords.currentPassword && passwords.newPassword === passwords.confirmPassword;
  const departments = ['Human Resources','Information Technology','Finance','Accounting','Operations','Administration','Marketing','Sales','Customer Support','Procurement','Engineering','Legal','Executive'];
  const isCustom = department && !departments.includes(department);
  return <div className="mx-auto max-w-4xl space-y-5"><div><p className="eyebrow text-brand-700">Account</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage your profile, security, and workspace preferences.</p></div><div className="grid gap-5 lg:grid-cols-2"><Section icon={UserRound} title="Profile" description="Update the name and department shown across tickets."><form className="space-y-4" onSubmit={saveProfile}><Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} required /><div><label className="mb-1.5 block text-sm font-medium text-slate-700">Department</label><select className="input" value={isCustom ? 'Other' : department} onChange={(event) => setDepartment(event.target.value === 'Other' ? (isCustom ? department : '') : event.target.value)}><option value="">Not specified</option>{departments.map((option) => <option key={option} value={option}>{option}</option>)}<option value="Other">Other</option></select></div>{(isCustom || department === '') && <Input label="Custom department" value={isCustom ? department : ''} maxLength={100} onChange={(event) => setDepartment(event.target.value)} helperText="Optional; up to 100 characters." />}<Button type="submit" isLoading={savingProfile}><Save className="h-4 w-4" /> Save profile</Button></form></Section><NotificationPreferencesSection /></div></div>;
}
