import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const authState = vi.hoisted(() => ({ role: 'USER', user: { name: 'Test User' } }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));

afterEach(() => {
  cleanup();
  authState.role = 'USER';
});

describe('Sidebar dashboard navigation', () => {
  it('labels the existing dashboard route Summary', () => {
    render(<MemoryRouter><Sidebar mobileOpen={false} onClose={vi.fn()} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Summary' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Reports' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Knowledge Base' })).toHaveAttribute('href', '/knowledge');
    expect(screen.queryByRole('link', { name: 'Manage Knowledge' })).not.toBeInTheDocument();
  });

  it.each([
    ['AGENT', 'My Reports'],
    ['ADMIN', 'Reports'],
  ])('shows the role-specific reports link for %s while preserving Summary', (role, label) => {
    authState.role = role;
    render(<MemoryRouter><Sidebar mobileOpen={false} onClose={vi.fn()} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', '/reports');
    expect(screen.getByRole('link', { name: 'Summary' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Manage Knowledge' })).toHaveAttribute('href', '/knowledge/manage');
  });
});
