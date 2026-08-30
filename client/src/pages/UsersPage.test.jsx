import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('../hooks/useUsers', () => ({
  useUsers: () => ({ data: [{ id: 'verified', name: 'Alice', email: 'verified@example.test', role: 'USER', isActive: true, emailVerified: true }, { id: 'unverified', name: 'Bob', email: 'unverified@example.test', role: 'USER', isActive: true, emailVerified: false }], isLoading: false, isError: false }),
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUserRole: () => ({ mutate: vi.fn() }),
  useDeactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useReactivateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('UsersPage verification display', () => {
  it('uses emailVerified rather than account activity for verification labels', () => {
    render(<UsersPage />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });
});
