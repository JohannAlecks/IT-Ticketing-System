import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import KnowledgeEditorPage from './KnowledgeEditorPage';

const state = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../hooks/useKnowledge', () => ({
  useManagedKnowledgeArticle: () => ({ data: null, isLoading: false, isError: false }),
  useCreateKnowledgeArticle: () => ({ mutate: state.create, isPending: false }),
  useUpdateKnowledgeArticle: () => ({ mutate: vi.fn(), isPending: false }),
  knowledgeErrorMessage: () => 'Save failed',
}));

describe('KnowledgeEditorPage draft form', () => {
  it('keeps entered fields in the live form, normalizes tags on save, and does not persist a draft in storage', () => {
    localStorage.clear();
    render(<MemoryRouter><KnowledgeEditorPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reset VPN access' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'How to restore access.' } });
    fireEvent.change(screen.getByLabelText('Article content'), { target: { value: 'Open settings and reconnect.' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: ' vpn, access, vpn, ' } });
    expect(screen.getByLabelText('Visibility')).toHaveValue('INTERNAL');
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'INTERNAL' } });
    expect(screen.getByLabelText('Title')).toHaveValue('Reset VPN access');
    expect(screen.getByLabelText('Visibility')).toHaveValue('INTERNAL');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ['vpn', 'access'], visibility: 'INTERNAL' }), expect.any(Object));
    expect(localStorage.getItem('knowledge-draft')).toBeNull();
  });
});
