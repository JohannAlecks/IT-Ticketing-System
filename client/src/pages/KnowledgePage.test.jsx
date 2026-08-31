import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import KnowledgePage from './KnowledgePage';

const state = vi.hoisted(() => ({ role: 'USER' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: state.role, user: { id: 'user-1' } }) }));
vi.mock('../hooks/useKnowledge', () => ({ useKnowledgeList: () => ({ data: { articles: [{ id: 'a1', slug: 'internal-guide', title: 'Internal guide', summary: 'For support', ticketCategory: 'SOFTWARE', tags: ['vpn'], visibility: 'INTERNAL', updatedAt: '2026-01-01T00:00:00Z' }], pagination: { page: 1, totalPages: 1, total: 1 } }, isLoading: false, isError: false }) }));

describe('KnowledgePage role-aware cards', () => {
  it('keeps INTERNAL labels out of the USER view', () => {
    state.role = 'USER';
    render(<MemoryRouter><KnowledgePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Knowledge Base' })).toBeInTheDocument();
    expect(screen.queryByText('Internal article')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage Knowledge' })).not.toBeInTheDocument();
  });

  it('shows staff management and internal context', () => {
    state.role = 'AGENT';
    render(<MemoryRouter><KnowledgePage /></MemoryRouter>);
    expect(screen.getByText('Internal article')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Knowledge' })).toHaveAttribute('href', '/knowledge/manage');
  });
});
