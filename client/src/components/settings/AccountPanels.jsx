import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { settingsApi } from '../../api/settings.api';
import { protectedQueryKeys } from '../../query/protectedCache';
import { formatDate } from '../../utils/format';
import Input from '../ui/Input';
import DepartmentPicker from './DepartmentPicker';
import Button from '../ui/Button';
export function AccountFacts({ user }) {
  return <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Email</dt><dd className="break-all">{user.email}</dd></div><div><dt className="text-slate-500">Role</dt><dd><span className="badge bg-slate-100 text-slate-700">{user.role}</span></dd></div><div><dt className="text-slate-500">Account status</dt><dd>{user.isActive === false ? 'Inactive' : 'Active'}</dd></div><div><dt className="text-slate-500">Email verification</dt><dd>{user.emailVerified ? 'Verified' : 'Unverified'}</dd></div>{user.createdAt && <div><dt className="text-slate-500">Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>}</dl>;
}
export function ProfilePanel({ onDirtyChange }) {
  const { user, role, updateUser } = useAuth(); const client = useQueryClient();
  const query = useQuery({ queryKey: ['protected', user.id, role, 'settings-profile'], queryFn: ({ signal }) => settingsApi.me(signal), retry: false });
  const [baseline, setBaseline] = useState(user); const [name, setName] = useState(user.name || ''); const [department, setDepartment] = useState(user.departmentId || null);
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState(null);
  const active = useRef(true); const pending = useRef(false);
  const [clearLegacy, setClearLegacy] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const dirty = clearLegacy || name !== (baseline.name || '') || department !== (baseline.departmentId || null);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const reset = (value) => { setBaseline(value); setName(value.name || ''); setDepartment(value.departmentId || null); setClearLegacy(false); };
  useEffect(() => { if (query.data && !dirty && !busy) reset(query.data); }, [query.data]);
  const save = async (e) => {
    e.preventDefault(); if (pending.current || !dirty) return; pending.current = true; setBusy(true); setFeedback(null);
    try { const result = await settingsApi.updateProfile({ name: name.trim(), ...(clearLegacy || department !== (baseline.departmentId || null) ? { departmentId: department, previousDepartmentId: baseline.departmentId || null } : {}) });
      if (!active.current) return;
      await updateUser(result); reset(result);
      await client.invalidateQueries({ queryKey: protectedQueryKeys.root(user.id) });
      if (active.current) setFeedback({ text: 'Profile saved. Your name and department are refreshed across this account.' });
    } catch { if (active.current) setFeedback({ error: true, text: 'Could not save your profile. Check the fields and try again.' }); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <section className="card space-y-5 p-5"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">{user.name?.split(' ').map((v) => v[0]).slice(0, 2).join('')}</span><div><h2 className="font-semibold">Profile</h2><p className="text-sm text-slate-500">Your identity across the help desk.</p></div></div>
    <AccountFacts user={{ ...user, ...query.data }} />
    {query.isError && <p role="alert">Profile information could not be refreshed. <Button variant="secondary" onClick={() => query.refetch()}>Retry profile</Button></p>}
    <form onSubmit={save} className="space-y-4"><Input label="Full name" minLength={2} maxLength={100} required autoComplete="name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
      <DepartmentPicker value={department} onChange={setDepartment} current={baseline.departmentRecord} disabled={busy} />
      {!baseline.departmentId && baseline.department && <div className="text-sm text-amber-700"><p>Legacy department: {baseline.department}. Choose a directory entry to replace this legacy value.</p><Button type="button" variant="secondary" disabled={busy} onClick={() => { setDepartment(null); setClearLegacy(true); }}>Clear legacy department</Button></div>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" isLoading={busy} disabled={!dirty || name.trim().length < 2}>Save profile</Button><Button type="button" variant="secondary" disabled={!dirty || busy} onClick={() => { reset(baseline); setFeedback(null); }}>Discard changes</Button>{dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}</div>
      {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </form></section>;
}
export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  return <section className="card space-y-5 p-5"><h2 className="font-semibold">Appearance</h2><p className="text-sm text-slate-500">Saved in this browser. System follows your device’s appearance.</p><fieldset className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">Color theme</legend>{['light', 'dark', 'system'].map((option) => <label key={option} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 has-[:checked]:ring-2 has-[:checked]:ring-brand-600"><input type="radio" name="theme" value={option} checked={theme === option} onChange={() => setTheme(option)} /><span className="capitalize">{option}</span></label>)}</fieldset><p className="text-sm text-slate-500">Keyboard focus stays visible. Motion follows your device’s reduced-motion setting.</p></section>;
}
function PasswordField({ label, value, onChange, autoComplete, describedBy, error }) {
  const [visible, setVisible] = useState(false); const [caps, setCaps] = useState(false); const id = useId();
  return <div><div className="flex items-end gap-2"><Input id={id} label={label} aria-describedby={describedBy} error={error} value={value} onChange={onChange} type={visible ? 'text' : 'password'} maxLength={128} required autoComplete={autoComplete} onKeyUp={(e) => setCaps(Boolean(e.getModifierState?.('CapsLock')))} onBlur={() => setCaps(false)} /><Button type="button" variant="secondary" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>{visible ? 'Hide' : 'Show'}</Button></div>{caps && <p role="status" className="text-sm text-amber-700">Caps Lock is on.</p>}</div>;
}
export function SecurityPanel() {
  const { user } = useAuth(); const [values, setValues] = useState({ current: '', next: '', confirm: '' }); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState(null); const pending = useRef(false);
  const rules = [['8–128 characters', values.next.length >= 8 && values.next.length <= 128], ['Uppercase letter', /[A-Z]/.test(values.next)], ['Lowercase letter', /[a-z]/.test(values.next)], ['Number', /\d/.test(values.next)], ['Special character', /[^A-Za-z0-9]/.test(values.next)]];
  const score = rules.filter(([, pass]) => pass).length; const valid = score === 5 && values.current && values.next === values.confirm;
  const save = async (e) => { e.preventDefault(); if (!valid || pending.current) return; pending.current = true; setBusy(true); setFeedback(null); try { await settingsApi.changePassword({ currentPassword: values.current, newPassword: values.next }); setValues({ current: '', next: '', confirm: '' }); setFeedback({ text: 'Password changed.' }); } catch { setFeedback({ error: true, text: 'Password change failed. Check your current password and try again.' }); } finally { pending.current = false; setBusy(false); } };
  return <section className="card space-y-5 p-5"><h2 className="font-semibold">Security</h2><AccountFacts user={user} /><form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Change password</legend>{[['current', 'Current password', 'current-password'], ['next', 'New password', 'new-password'], ['confirm', 'Confirm password', 'new-password']].map(([key, label, autoComplete]) => <PasswordField key={key} label={label} describedBy={key === 'next' ? 'password-requirements' : undefined} error={key === 'confirm' && values.confirm && values.next !== values.confirm ? 'Passwords do not match.' : undefined} autoComplete={autoComplete} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />)}<p className="text-sm">Requirements met: {score}/5 · Password guidance: {score === 5 ? 'All required checks passed; use a unique password.' : 'Needs improvement.'}</p><ul id="password-requirements" className="grid gap-1 text-sm sm:grid-cols-2">{rules.map(([label, pass]) => <li key={label}>{pass ? '✓' : '○'} {label}</li>)}</ul><Button type="submit" disabled={!valid} isLoading={busy}>Change password</Button></fieldset>{feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}</form><p className="text-sm text-slate-500">Device sessions and sign-out-all controls are not available.</p></section>;
}
export function ApplicationPanel() {
  const { user, role } = useAuth(); const query = useQuery({ queryKey: ['protected', user.id, role, 'settings-system'], queryFn: ({ signal }) => settingsApi.system(signal), enabled: role === 'ADMIN', retry: false });
  return <section className="card space-y-4 p-5"><h2 className="font-semibold">Application settings</h2><p className="text-sm text-slate-500">Read-only server configuration. No configuration changes or email actions are available here.</p>{query.isPending && <p role="status">Loading application information…</p>}{query.isError && <p role="alert">Application information unavailable. <Button onClick={() => query.refetch()}>Retry</Button></p>}{query.data && !query.isError && <dl className="space-y-2 text-sm">{Object.entries({ Environment: query.data.environment, 'Attachment storage': query.data.attachmentProvider, 'Attachment limit (MB)': query.data.maxAttachmentSizeMb, 'Email delivery': query.data.emailDeliveryConfigured ? 'Configured on server; no actions available here' : 'Disabled' }).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>}</section>;
}
