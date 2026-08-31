import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeArticlePage from './KnowledgeArticlePage';

const article = { id: 'article-1', slug: 'safe-text', title: 'Safe text', summary: 'A safe article', content: '<script>window.bad = true</script>\nRead this as text.', ticketCategory: 'SOFTWARE', tags: ['security'], visibility: 'INTERNAL', viewerFeedback: null, publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
const state = vi.hoisted(() => ({ role: 'USER', feedback: vi.fn(), remove: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: state.role, user: { id: 'user-1' } }) }));
vi.mock('../hooks/useKnowledge', () => ({
  useKnowledgeArticle: () => ({ data: article, isLoading: false, isError: false }),
  useKnowledgeSuggestions: () => ({ data: [], isLoading: false }),
  useKnowledgeFeedback: () => ({ mutate: state.feedback, isPending: false, isError: false }),
  useRemoveKnowledgeFeedback: () => ({ mutate: state.remove, isError: false }),
}));

afterEach(cleanup);

describe('KnowledgeArticlePage content safety and feedback', () => {
  it('renders script-like content as inert text and hides the internal label for USERs', () => {
    state.role = 'USER';
    const { container } = render(<MemoryRouter initialEntries={['/knowledge/safe-text']}><Routes><Route path="/knowledge/:slug" element={<KnowledgeArticlePage />} /></Routes></MemoryRouter>);
    expect(screen.getByText('<script>window.bad = true</script>', { exact: false })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByText('Internal article')).not.toBeInTheDocument();
  });

  it('exposes pressed feedback controls and lets a support reader see the internal marker', () => {
    state.role = 'AGENT';
    render(<MemoryRouter initialEntries={['/knowledge/safe-text']}><Routes><Route path="/knowledge/:slug" element={<KnowledgeArticlePage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Helpful' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Internal article')).toBeInTheDocument();
  });
});
