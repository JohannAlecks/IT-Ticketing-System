import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
afterEach(() => cleanup());
import TicketControls, { ALLOWED_TRANSITIONS } from './TicketControls';

const mutationState = vi.hoisted(() => ({ update: vi.fn(), assign: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: 'ADMIN', user: { id: 'admin-1' } }) }));
vi.mock('../../hooks/useAgents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('../../hooks/useTickets', () => ({
  useUpdateTicket: () => ({ mutate: mutationState.update, isPending: false }),
  useAssignTicket: () => ({ mutate: mutationState.assign, isPending: false }),
}));

describe('TicketControls workflow contract', () => {
  beforeEach(() => {
    mutationState.update.mockReset();
    mutationState.assign.mockReset();
  });

  it('matches the server transition contract for reopening', () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(['OPEN']);
  });

  it('offers reopening while priority and assignment remain locked', () => {
    render(<QueryClientProvider client={new QueryClient()}><TicketControls ticket={{ id: 'ticket-1', status: 'CLOSED', priority: 'HIGH', assignedTo: null }} /></QueryClientProvider>);

    expect(screen.getByRole('option', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeDisabled();
    expect(screen.getByLabelText('Assigned agent')).toBeDisabled();
  });

  it('renders a pending reason selector before entering pending and submits the explicit reason', () => {
    render(<QueryClientProvider client={new QueryClient()}><TicketControls ticket={{ id: 'ticket-1', status: 'IN_PROGRESS', priority: 'HIGH', assignedTo: null }} /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText('Pending reason'), { target: { value: 'WAITING_FOR_REQUESTER' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PENDING' } });

    expect(mutationState.update).toHaveBeenCalledWith({ status: 'PENDING', pendingReason: 'WAITING_FOR_REQUESTER' });
  });

  it('allows an existing pending ticket to change its reason', () => {
    render(<QueryClientProvider client={new QueryClient()}><TicketControls ticket={{ id: 'ticket-1', status: 'PENDING', pendingReason: 'OTHER', priority: 'HIGH', assignedTo: null }} /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText('Pending reason'), { target: { value: 'WAITING_FOR_REQUESTER' } });
    expect(mutationState.update).toHaveBeenCalledWith({ pendingReason: 'WAITING_FOR_REQUESTER' });
  });
});
