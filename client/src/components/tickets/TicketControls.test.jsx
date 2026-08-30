import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TicketControls, { ALLOWED_TRANSITIONS } from './TicketControls';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: 'ADMIN', user: { id: 'admin-1' } }) }));
vi.mock('../../hooks/useAgents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('../../hooks/useTickets', () => ({
  useUpdateTicket: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignTicket: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('TicketControls workflow contract', () => {
  it('matches the server transition contract for reopening', () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(['OPEN']);
  });

  it('offers reopening while priority and assignment remain locked', () => {
    render(<QueryClientProvider client={new QueryClient()}><TicketControls ticket={{ id: 'ticket-1', status: 'CLOSED', priority: 'HIGH', assignedTo: null }} /></QueryClientProvider>);

    expect(screen.getByRole('option', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeDisabled();
    expect(screen.getByLabelText('Assigned agent')).toBeDisabled();
  });
});
