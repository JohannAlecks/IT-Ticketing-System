import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeManagePage from './KnowledgeManagePage';

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
afterEach(() => { cleanup(); state.mutate.mockClear(); });
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: 'ADMIN', user: { id: 'admin-1' } }) }));
vi.mock('../hooks/useKnowledge', () => ({
  useKnowledgeList: () => ({ data: { articles: [{ id: 'review-1', title: 'Review me', summary: 'Summary', status: 'IN_REVIEW', visibility: 'PUBLIC', ticketCategory: 'SOFTWARE', tags: [], version: 4, author: { id: 'agent-1' }, updatedAt: '2026-01-01T00:00:00Z' }] }, isLoading: false, isError: false }),
  useKnowledgeWorkflow: () => ({ mutate: state.mutate, isPending: false }),
  useKnowledgeFeedbackSummary: () => ({ data: null, isLoading: false, isError: false }),
  knowledgeErrorMessage: () => 'Workflow failed',
}));

describe('KnowledgeManagePage workflows', () => {
  it.each(['Publish', 'Return to draft'])('keeps a failed %s error inside its active modal, not the inert background', (action) => {
    render(<MemoryRouter><KnowledgeManagePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'In Review' }));
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    const dialog = screen.getByRole('dialog');
    if (action === 'Return to draft') fireEvent.change(within(dialog).getByLabelText('Required review note'), { target: { value: 'Please clarify the instructions.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: action, exact: true }));
    const [, handlers] = state.mutate.mock.calls.at(-1);
    act(() => handlers.onError(new Error('Synthetic workflow conflict')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Workflow failed');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
  it('requires confirmation before publishing an in-review article', () => {
    render(<MemoryRouter><KnowledgeManagePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'In Review' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish', id: 'review-1', version: 4 }), expect.any(Object));
  });
});
