import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Eye, EyeOff, LockKeyhole, Monitor, Palette, Save, ShieldCheck, UserRound, X } from 'lucide-react';
import { settingsApi } from '../api/settings.api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

function Section({ icon: Icon, title, description, children }) {
  return <section className="card p-5"><div className="mb-5 flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></div><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{description}</p></div></div>{children}</section>;
}

function PasswordField({ label, value, onChange, autoComplete, helperText }) {
  const [visible, setVisible] = useState(false);
  return <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label><div className="relative"><input className="input pr-11" type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required /><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}</div>;
}

export default function SettingsPage() {
  const { user, updateUser, role } = useAuth();
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
  return <div className="mx-auto max-w-4xl space-y-5"><div><p className="eyebrow text-brand-700">Account</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage your profile, security, and workspace preferences.</p></div><div className="grid gap-5 lg:grid-cols-2"><Section icon={UserRound} title="Profile" description="Update the name and department shown across tickets."><form className="space-y-4" onSubmit={saveProfile}><Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} required /><div><label className="mb-1.5 block text-sm font-medium text-slate-700">Department</label><select className="input" value={isCustom ? 'Other' : department} onChange={(event) => setDepartment(event.target.value === 'Other' ? (isCustom ? department : '') : event.target.value)}><option value="">Not specified</option>{departments.map((option) => <option key={option} value={option}>{option}</option>)}<option value="Other">Other</option></select></div>{(isCustom || department === '') && <Input label="Custom department" value={isCustom ? department : ''} maxLength={100} onChange={(event) => setDepartment(event.target.value)} helperText="Optional; up to 100 characters." />}<Button type="submit" isLoading={savingProfile}><Save className="h-4 w-4" /> Save profile</Button></form></Section></div></div>;
}
