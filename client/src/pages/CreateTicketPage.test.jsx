import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CreateTicketPage from './CreateTicketPage';

const state = vi.hoisted(() => ({ role: 'USER', suggestionArgs: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', department: 'IT' }, role: state.role }) }));
vi.mock('../hooks/useTickets', () => ({ useCreateTicket: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../hooks/useKnowledge', () => ({ useKnowledgeSuggestions: (args) => { state.suggestionArgs = args; return { data: [{ id: 'kb-1', slug: 'vpn-guide', title: 'VPN guide', visibility: 'INTERNAL' }], isSuccess: true }; } }));

describe('CreateTicketPage Knowledge suggestions', () => {
  it('requests three category suggestions without affecting the ticket form and keeps links in a new tab', () => {
    state.role = 'AGENT';
    render(<MemoryRouter><CreateTicketPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'VPN cannot connect' } });
    expect(state.suggestionArgs).toMatchObject({ category: 'OTHERS', search: 'VPN cannot connect', limit: 3 });
    const link = screen.getByRole('link', { name: 'VPN guide' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('VPN cannot connect');
  });
});
