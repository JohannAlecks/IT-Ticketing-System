import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage';
afterEach(cleanup);
const queryState = vi.hoisted(() => ({ params: null }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('../hooks/useUsers', () => ({
  useUsers: (params) => { queryState.params = params; return { data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Alice', email: 'verified@example.test', role: 'USER', isActive: false, emailVerified: true }, { id: 'unverified', name: 'Bob', email: 'unverified@example.test', role: 'USER', isActive: true, emailVerified: false }], isLoading: false, isError: false }; },
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUserRole: () => ({ mutate: vi.fn() }),
  useDeactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useReactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('UsersPage verification display', () => {
  it('uses emailVerified rather than account activity for verification labels', () => {
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });
  it('search destination includes inactive users and focuses the selected directory row', () => {
    render(<MemoryRouter initialEntries={['/users?status=ALL#user-11111111-1111-4111-8111-111111111111']}><UsersPage /></MemoryRouter>);
    expect(queryState.params.status).toBe('ALL');
    expect(screen.getByText('Alice').closest('tr')).toHaveFocus();
  });
});
