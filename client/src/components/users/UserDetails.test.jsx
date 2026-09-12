import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UserDetails from './UserDetails';
vi.mock('../../hooks/useDepartments', () => ({ useDepartmentMutation: () => ({ mutateAsync: vi.fn() }), useDepartments: () => ({ data: { departments: [], pagination: { totalPages: 1 } } }) }));
const state = vi.hoisted(() => ({ target: {}, change: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, role: 'ADMIN' }) }));
vi.mock('../../hooks/useUsers', () => ({
  useUserDetails: () => ({ data: { user: state.target, activeWorkload: 3, recentTickets: [], lifecycle: [], sla: { dueSoon: 1, breached: 2 }, csat: { count: 0, average: null } } }),
  useUpdateUserRole: () => ({ mutateAsync: state.change }),
  useDeactivateUser: () => ({ mutateAsync: state.deactivate }),
  useReactivateUser: () => ({ mutateAsync: state.reactivate }),
}));
beforeEach(() => { vi.resetAllMocks(); state.target = { id: 'agent', name: 'Test Agent', email: 'agent@example.test', role: 'AGENT', department: 'IT', isActive: true, emailVerified: true }; });
afterEach(cleanup);
const show = (action = 'status', onClose = vi.fn()) => render(<MemoryRouter><UserDetails id={state.target.id} action={action} onClose={onClose} /></MemoryRouter>);
it('requires an explicit deactivation confirmation containing account and workload information', async () => {
  const close = vi.fn(); show('status', close);
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByText('agent@example.test')).toBeInTheDocument();
  expect(screen.getByText('Department: IT')).toBeInTheDocument(); expect(screen.getByText('3')).toBeInTheDocument();
  expect(state.deactivate).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(state.deactivate).toHaveBeenCalledWith('agent');
});
it('reactivation is correctly worded and uses only its own endpoint', async () => {
  state.target.isActive = false; show(); expect(screen.getByText(/old assignments are not restored/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reactivate account' })); await waitFor(() => expect(state.reactivate).toHaveBeenCalledWith('agent')); expect(state.deactivate).not.toHaveBeenCalled();
});
it('role changes show current/proposed roles and sanitize failures without closing', async () => {
  const close = vi.fn(); state.change.mockRejectedValue(new Error('Private database internals')); show('role', close);
  expect(screen.getByRole('button', { name: 'Confirm role change' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Proposed role'), { target: { value: 'USER' } });
  expect(screen.getByText(/Current role: AGENT. Proposed role: USER/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('Private database internals'); expect(close).not.toHaveBeenCalled(); expect(state.change).toHaveBeenCalledWith({ id: 'agent', role: 'USER' });
});
it('self-actions are disabled and unrated CSAT never invents a zero rating', () => {
  state.target.id = 'admin'; const ui = show(); expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeDisabled(); ui.unmount();
  show('details'); expect(screen.getByText('Agent CSAT: No ratings yet')).toBeInTheDocument(); expect(screen.getByText(/not last login or user activity/)).toBeInTheDocument();
});
