import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';
const auth = vi.hoisted(() => ({ user: { id: 'one', name: 'A Person', email: 'one@example.test', role: 'USER', department: null, isActive: true, emailVerified: true }, role: 'USER', updateUser: vi.fn() }));
const api = vi.hoisted(() => ({ me: vi.fn(), updateProfile: vi.fn(), changePassword: vi.fn(), system: vi.fn() }));
const theme = vi.hoisted(() => ({ theme: 'system', setTheme: vi.fn() }));
vi.mock('../hooks/useDepartments', () => ({ useDepartments: () => ({ data: { departments: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'New Team', isActive: true }], pagination: { totalPages: 1 } } }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => theme }));
vi.mock('../api/settings.api', () => ({ settingsApi: api }));
vi.mock('../components/personal/PersonalShortcuts', () => ({ default: () => <div>Shortcut management</div> }));
vi.mock('../components/sla/SlaPolicySettings', () => ({ default: () => <div>Admin SLA policy management</div> }));
beforeEach(() => { vi.resetAllMocks(); auth.user = { id: 'one', name: 'A Person', email: 'one@example.test', role: 'USER', department: null, isActive: true, emailVerified: true }; auth.role = 'USER'; api.me.mockImplementation(async () => auth.user); });
afterEach(cleanup);
function show(path = '/settings') { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, ...render(<SettingsPage />, { wrapper: ({ children }) => <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{children}</MemoryRouter></QueryClientProvider> }) }; }
it.each(['USER', 'AGENT'])('%s cannot render Admin panels even using their URL', async (role) => {
  auth.role = role; auth.user.role = role; show('/settings?section=application');
  expect(screen.queryByRole('button', { name: 'Application settings' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'SLA policies' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument(); expect(api.system).not.toHaveBeenCalled();
});
it('Admin legacy SLA link and compact navigation preserve authorization', () => {
  auth.role = 'ADMIN'; auth.user.role = 'ADMIN'; show('/settings#sla-policies');
  expect(screen.getByText('Admin SLA policy management')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Settings section'), { target: { value: 'appearance' } });
  expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'dark' })); expect(theme.setTheme).toHaveBeenCalledWith('dark');
});
it('profile selects a structured department with immediate Auth refresh and account cache invalidation', async () => {
  const { client } = show(); const invalidate = vi.spyOn(client, 'invalidateQueries');
  await waitFor(() => expect(api.me).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Updated Person ' } });
  fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
  expect(screen.queryByLabelText('Custom department')).not.toBeInTheDocument();
  api.updateProfile.mockImplementation(async (input) => { auth.user = { ...auth.user, ...input, department: 'New Team' }; return auth.user; });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByText(/Profile saved/);
  expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Updated Person', departmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousDepartmentId: null });
  expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ department: 'New Team' })); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['protected', 'one'] });
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('profile warns before section navigation, discards explicitly and never saves on Discard', async () => {
  show(); await waitFor(() => expect(api.me).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Draft Person' } });
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' })); expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' })); expect(screen.getByLabelText('Full name')).toHaveValue('Draft Person');
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' })); expect(screen.getByLabelText('Full name')).toHaveValue('A Person'); expect(api.updateProfile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' })); expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
});
it('legacy fallback is preserved on name-only save and can be explicitly cleared', async () => {
  auth.user.department = 'Unmapped legacy value';
  api.updateProfile.mockImplementation(async (input) => { auth.user = { ...auth.user, ...input, ...(input.departmentId === null ? { department: null } : {}) }; return auth.user; });
  show(); await waitFor(() => expect(api.me).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed Person' } }); fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByText(/Profile saved/); expect(api.updateProfile).toHaveBeenLastCalledWith({ name: 'Renamed Person' });
  fireEvent.click(screen.getByRole('button', { name: 'Clear legacy department' })); fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(api.updateProfile).toHaveBeenLastCalledWith({ name: 'Renamed Person', departmentId: null, previousDepartmentId: null }));
});
it('late profile response cannot update a switched account', async () => {
  const ui = show(); let finish; api.updateProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await waitFor(() => expect(api.me).toHaveBeenCalled()); fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(finish).toBeTypeOf('function')); auth.user = { ...auth.user, id: 'two', name: 'Second' }; ui.rerender(<SettingsPage />);
  await act(async () => finish({ id: 'one', name: 'Changed', role: 'USER' })); expect(auth.updateUser).not.toHaveBeenCalled(); expect(screen.getByLabelText('Full name')).toHaveValue('Second');
});
it('password visibility is independent, never submits, and requirements/mismatch govern save', async () => {
  show('/settings?section=security');
  fireEvent.click(screen.getByRole('button', { name: 'Show current password' })); expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'text'); expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password'); expect(api.changePassword).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'CurrentFixture1!' } }); fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NextFixture2!' } }); fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'mismatch' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match'); expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NextFixture2!' } }); fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await screen.findByText('Password changed.'); expect(api.changePassword).toHaveBeenCalledWith({ currentPassword: 'CurrentFixture1!', newPassword: 'NextFixture2!' }); expect(screen.getByLabelText('New password')).toHaveValue('');
});
