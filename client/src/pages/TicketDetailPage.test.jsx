import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TicketDetailPage from './TicketDetailPage';

const hooks = vi.hoisted(() => ({
  auth: { role: 'ADMIN', user: { id: 'admin-1', name: 'Ada Admin' } },
  ticket: null,
  ticketQuery: { data: null, isLoading: false, isError: false, error: null },
  archive: { mutate: vi.fn(), isPending: false },
  restore: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => hooks.auth }));
vi.mock('../hooks/useTickets', () => ({
  useTicket: () => hooks.ticketQuery,
  useDeleteTicket: () => hooks.remove,
  useArchiveTicket: () => hooks.archive,
  useRestoreTicket: () => hooks.restore,
}));
vi.mock('../components/tickets/TicketControls', () => ({ default: () => <div>Ticket controls</div> }));
vi.mock('../components/tickets/CommentList', () => ({ default: () => <div>Comments and history remain visible</div> }));
vi.mock('../components/tickets/CommentForm', () => ({ default: () => <div>Comment form</div> }));
vi.mock('../components/tickets/HistoryTimeline', () => ({ default: () => <div>Activity history</div> }));
vi.mock('../components/tickets/TicketAttachments', () => ({
  default: ({ readOnly }) => <div>{readOnly ? 'Attachment downloads remain available' : 'Upload attachment Delete attachment'}</div>,
}));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function activeTicket(overrides = {}) {
  return {
    id: 'ticket-12345678',
    title: 'Resolve VPN access',
    description: 'A sufficiently detailed ticket description.',
    status: 'RESOLVED',
    priority: 'HIGH',
    category: 'VPN',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Uma User', email: 'uma@example.test', department: 'Finance' },
    assignedTo: { id: 'agent-1', name: 'Alex Agent' },
    comments: [{ id: 'comment-1' }],
    history: [{ id: 'history-1' }],
    ...overrides,
  };
}

function renderPage(initialEntries = ['/tickets/ticket-12345678']) {
  return render(<MemoryRouter initialEntries={initialEntries}><TicketDetailPage /><LocationProbe /></MemoryRouter>);
}

function reset({ role = 'ADMIN', user = { id: 'admin-1', name: 'Ada Admin' }, ticket = activeTicket() } = {}) {
  hooks.auth = { role, user };
  hooks.ticket = ticket;
  hooks.ticketQuery = { data: ticket, isLoading: false, isError: false, error: null };
  hooks.archive = { mutate: vi.fn(), isPending: false };
  hooks.restore = { mutate: vi.fn(), isPending: false };
  hooks.remove = { mutate: vi.fn(), isPending: false };
}

afterEach(() => {
  cleanup();
  reset();
});

describe('TicketDetailPage archived workflow', () => {
  it('renders archived work read-only while keeping comments, activity, and attachment downloads visible', () => {
    reset({
      role: 'AGENT',
      user: { id: 'agent-1', name: 'Alex Agent' },
      ticket: activeTicket({ archivedAt: '2026-09-02T11:30:00.000Z' }),
    });
    renderPage();

    expect(screen.getByRole('status', { name: 'Archived work item' })).toHaveTextContent('read-only');
    expect(screen.getByText('Archived work item')).toBeInTheDocument();
    expect(screen.getByText('Comments and history remain visible')).toBeInTheDocument();
    expect(screen.getByText('Attachment downloads remain available')).toBeInTheDocument();
    expect(screen.queryByText('Ticket controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Comment form')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload attachment Delete attachment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete ticket' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByText('Archived by')).not.toBeInTheDocument();
  });

  it('shows the returned archive actor only to the returned detail view and restores for admins', () => {
    reset({
      role: 'ADMIN',
      ticket: activeTicket({ archivedAt: '2026-09-02T11:30:00.000Z', archivedBy: { id: 'admin-1', name: 'Ada Admin' } }),
    });
    renderPage();

    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('previous workflow status will be retained');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore to active work' }));
    expect(hooks.restore.mutate).toHaveBeenCalledTimes(1);
    act(() => hooks.restore.mutate.mock.calls[0][1].onSuccess());
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets');
  });

  it.each([
    ['ADMIN', 'admin-1', 'RESOLVED', true],
    ['AGENT', 'agent-1', 'CLOSED', true],
    ['AGENT', 'other-agent', 'RESOLVED', false],
    ['AGENT', null, 'RESOLVED', false],
    ['USER', 'agent-1', 'RESOLVED', false],
    ['ADMIN', 'admin-1', 'IN_PROGRESS', false],
  ])('shows an active archive action only when %s is eligible', (role, assigneeId, status, shouldShow) => {
    reset({ role, user: { id: role === 'AGENT' ? 'agent-1' : 'admin-1', name: 'Current user' }, ticket: activeTicket({ status, assignedTo: assigneeId ? { id: assigneeId, name: 'Assigned' } : null }) });
    renderPage();

    if (shouldShow) {
      expect(screen.getByRole('button', { name: 'Archive ticket' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Archive ticket' })).not.toBeInTheDocument();
    }
  });

  it('uses archive-safe copy, cancels archive with Escape, and returns to the archive after success', () => {
    reset({ role: 'ADMIN', ticket: activeTicket({ status: 'CLOSED' }) });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Archive ticket' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('read-only');
    expect(screen.getByRole('dialog')).toHaveTextContent('Comments, attachments, and history will be preserved');
    expect(screen.getByRole('dialog')).toHaveTextContent('restore it later');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive ticket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to Archived' }));
    expect(hooks.archive.mutate).toHaveBeenCalledTimes(1);
    act(() => hooks.archive.mutate.mock.calls[0][1].onSuccess());
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets/archived');
  });

  it('defaults archived detail back navigation to the archive list without location state', () => {
    reset({ role: 'USER', ticket: activeTicket({ archivedAt: '2026-09-02T11:30:00.000Z' }) });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Back to archived work items' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets/archived');
  });
});
