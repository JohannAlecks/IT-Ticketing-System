import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UsersPage, { readUserFilters } from './UsersPage';
afterEach(cleanup);
const queryState = vi.hoisted(() => ({ params: null }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' }, role: 'ADMIN' }) }));
vi.mock('../components/users/UserDetails', () => ({ default: ({ id }) => <div>User details: {id}</div> }));
vi.mock('../hooks/useUsers', () => ({
  useUsers: (params) => { queryState.params = params; return { data: { users: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Alice', email: 'verified@example.test', role: 'USER', isActive: false, emailVerified: true }, { id: 'unverified', name: 'Bob', email: 'unverified@example.test', role: 'USER', isActive: true, emailVerified: false }] }, isLoading: false, isError: false }; },
  useUserSummary: () => ({ data: null }),
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUserRole: () => ({ mutate: vi.fn() }),
  useDeactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useReactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('UsersPage verification display', () => {
  it('filters and sort live in URL state and reset page; invalid URL values are bounded', () => {
    render(<MemoryRouter initialEntries={['/users?page=3']}><UsersPage /></MemoryRouter>);
    expect(queryState.params.page).toBe(3);
    fireEvent.change(screen.getByLabelText('Search name or email'), { target: { value: 'Alice' } });
    expect(queryState.params).toMatchObject({ page: 1, search: 'Alice' });
    fireEvent.change(screen.getByLabelText('Sort accounts'), { target: { value: 'name' } });
    expect(queryState.params.sort).toBe('name');
    expect(readUserFilters(new URLSearchParams('page=-2&sort=password&role=OWNER'))).toMatchObject({ page: 1, sort: 'newest', role: undefined });
  });
  it('uses emailVerified rather than account activity for verification labels', () => {
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unverified').length).toBeGreaterThan(0);
  });
  it('search destination includes inactive users and focuses the selected directory row', () => {
    render(<MemoryRouter initialEntries={['/users?status=ALL#user-11111111-1111-4111-8111-111111111111']}><UsersPage /></MemoryRouter>);
    expect(queryState.params.status).toBe('ALL');
    expect(screen.getByText('User details: 11111111-1111-4111-8111-111111111111')).toBeInTheDocument();
  });
});
