import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => cleanup());
import TicketFilters from './TicketFilters';

const authState = vi.hoisted(() => ({ role: 'AGENT', user: { id: 'agent-1' } }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../hooks/useAgents', () => ({ useAgents: () => ({ data: [{ id: 'agent-1', name: 'Avery Agent' }] }) }));

function renderFilters(filters = { page: 1, limit: 15, archive: 'active' }, onChange = vi.fn()) {
  return { onChange, ...render(<TicketFilters filters={filters} onChange={onChange} />) };
}

describe('TicketFilters SLA scope', () => {
  it('counts a false work-blocking filter and clears it without losing archive mode', () => {
    authState.role = 'USER';
    const { onChange } = renderFilters({ page: 3, limit: 15, archive: 'archived', isWorkBlocking: false });
    expect(screen.getByLabelText('Work blocking')).toHaveValue('false');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith({ page: 1, limit: 15, archive: 'archived' });
  });
  it('switching from unassigned work to Agent SLA removes contradictory assignment state', () => {
    authState.role = 'AGENT';
    const { onChange } = renderFilters({ page: 2, archive: 'active', assignmentState: 'UNASSIGNED' });
    fireEvent.change(screen.getByLabelText('SLA state'), { target: { value: 'BREACHED' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ assignmentState: undefined, assignedToId: 'agent-1', page: 1 }));
  });
  it('shows SLA states only to support roles and forces an Agent SLA filter to self', () => {
    authState.role = 'AGENT';
    const { onChange } = renderFilters();

    fireEvent.change(screen.getByLabelText('SLA state'), { target: { value: 'BREACHED' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ slaState: 'BREACHED', assignedToId: 'agent-1', page: 1 }));
  });

  it('removes the automatically added Agent assignment when the SLA filter is cleared', () => {
    authState.role = 'AGENT';
    const { onChange } = renderFilters({ page: 1, limit: 15, archive: 'active', slaState: 'DUE_SOON', assignedToId: 'agent-1' });

    fireEvent.change(screen.getByLabelText('SLA state'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ slaState: undefined, assignedToId: undefined, page: 1 }));
  });

  it('shows Department only to Admins and hides SLA filters in the archive', () => {
    authState.role = 'ADMIN';
    const { unmount } = renderFilters();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.getByLabelText('SLA state')).toBeInTheDocument();
    unmount();

    renderFilters({ page: 1, limit: 15, archive: 'archived' });
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.queryByLabelText('SLA state')).not.toBeInTheDocument();
  });

  it('does not render internal SLA or department controls for a requester', () => {
    authState.role = 'USER';
    renderFilters();
    expect(screen.queryByLabelText('SLA state')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
  });
});
