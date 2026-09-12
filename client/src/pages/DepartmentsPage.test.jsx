import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DepartmentsPage from './DepartmentsPage';
const state = vi.hoisted(() => ({ role: 'ADMIN', mutate: vi.fn(), requests: [], row: { id: 'one', name: 'IT', description: 'Support', version: 1, isActive: true, memberCount: 2, activeAgentCount: 1 }, target: { id: 'two', name: 'Operations', version: 3, isActive: true, memberCount: 4 } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, role: state.role }) }));
vi.mock('../hooks/useDepartments', () => ({ useDepartmentMutation: () => ({ mutateAsync: state.mutate }), useDepartments: (kind, params, id) => {
  state.requests.push({ kind, params, id });
  return { data: kind === 'members' ? (id ? { department: state.row, users: [{ id: 'member', name: 'Member', role: 'USER', isActive: true }], pagination: { total: 2, totalPages: 1 } } : undefined) : { departments: [state.row, state.target], pagination: { total: 2, totalPages: 1 } } };
} }));
beforeEach(() => { vi.resetAllMocks(); state.role = 'ADMIN'; state.requests = []; state.row.version = 1; state.target.isActive = true; }); afterEach(cleanup);
const show = () => render(<MemoryRouter initialEntries={['/departments']}><Routes><Route path="/departments" element={<DepartmentsPage />} /><Route path="/dashboard" element={<div>Safe dashboard</div>} /></Routes></MemoryRouter>);
it.each(['USER', 'AGENT'])('%s redirects without invoking management queries', (role) => { state.role = role; show(); expect(screen.getByText('Safe dashboard')).toBeInTheDocument(); expect(state.requests).toHaveLength(0); });
it('search/status use bounded query contracts and member preview requires explicit confirmation', async () => {
  show(); fireEvent.change(screen.getByLabelText('Search departments'), { target: { value: 'IT' } }); expect(state.requests.at(-1).params).toMatchObject({ search: 'IT', page: 1, limit: 20 });
  fireEvent.change(screen.getByLabelText('Actions for IT'), { target: { value: 'status' } });
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByText('Member · USER · Active')).toBeInTheDocument(); expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' })); await waitFor(() => expect(state.mutate).toHaveBeenCalledWith({ id: 'one', version: 1, isActive: false }));
});
it('merge rejects same/inactive targets and submits both reviewed versions', async () => {
  show(); fireEvent.change(screen.getByLabelText('Actions for IT'), { target: { value: 'merge' } });
  fireEvent.change(screen.getByLabelText('Target department'), { target: { value: 'one' } }); expect(screen.getByRole('button', { name: 'Confirm change' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Target department'), { target: { value: 'two' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith({ id: 'one', version: 1, targetId: 'two', targetVersion: 3 }));
});
it('creation and safe failure messages retain entered values', async () => {
  state.mutate.mockRejectedValue(new Error('SQL internals')); show(); fireEvent.click(screen.getByRole('button', { name: 'Create department' }));
  fireEvent.change(screen.getByLabelText('Department name'), { target: { value: 'Finance' } });
  fireEvent.submit(screen.getByLabelText('Department name').closest('form'));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('SQL internals'); expect(screen.getByLabelText('Department name')).toHaveValue('Finance');
});
