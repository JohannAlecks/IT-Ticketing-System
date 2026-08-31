import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import KnowledgeManagePage from './KnowledgeManagePage';

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: 'ADMIN', user: { id: 'admin-1' } }) }));
vi.mock('../hooks/useKnowledge', () => ({
  useKnowledgeList: () => ({ data: { articles: [{ id: 'review-1', title: 'Review me', summary: 'Summary', status: 'IN_REVIEW', visibility: 'PUBLIC', ticketCategory: 'SOFTWARE', tags: [], version: 4, author: { id: 'agent-1' }, updatedAt: '2026-01-01T00:00:00Z' }] }, isLoading: false, isError: false }),
  useKnowledgeWorkflow: () => ({ mutate: state.mutate, isPending: false }),
  useKnowledgeFeedbackSummary: () => ({ data: null, isLoading: false, isError: false }),
  knowledgeErrorMessage: () => 'Workflow failed',
}));

describe('KnowledgeManagePage workflows', () => {
  it('requires confirmation before publishing an in-review article', () => {
    render(<MemoryRouter><KnowledgeManagePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'In Review' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish', id: 'review-1', version: 4 }), expect.any(Object));
  });
});
