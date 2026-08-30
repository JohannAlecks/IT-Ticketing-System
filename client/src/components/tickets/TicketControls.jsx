import { useState } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAgents } from '../../hooks/useAgents';
import { useUpdateTicket, useAssignTicket } from '../../hooks/useTickets';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// Mirrors the backend's ALLOWED_TRANSITIONS map (ticket.service.js) so the
// dropdown only offers moves the API will actually accept. The backend is
// still the source of truth and re-validates this independently.
export const ALLOWED_TRANSITIONS = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'RESOLVED', 'OPEN'],
  PENDING: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

// Mirrors the backend's RBAC rules exactly:
// - USER: read-only on status/priority/assignment
// - ADMIN: full control, including reassigning to any agent
// - AGENT: can change status/priority on tickets visible to them, but the
//   assignment control is limited to "assign to me" / "unassign myself" —
//   reassigning to a *different* agent is admin-only. The backend
//   (ticket.service.js: assignTicket) enforces this independently; this UI
//   restriction just avoids surfacing an action that would 403.
export default function TicketControls({ ticket }) {
  const { role, user } = useAuth();
  const { data: agents } = useAgents();
  const canManage = role === 'AGENT' || role === 'ADMIN';
  const isAdmin = role === 'ADMIN';
  const isAgent = role === 'AGENT';
  const isClosed = ticket.status === 'CLOSED';
  const isAssignedToMe = ticket.assignedTo?.id === user?.id;

  const updateTicket = useUpdateTicket(ticket.id);
  const assignTicket = useAssignTicket(ticket.id);

  const nextStatuses = ALLOWED_TRANSITIONS[ticket.status] || [];

  // Closing is irreversible-feeling enough (and final enough in the
  // workflow) that we ask for explicit confirmation before firing the
  // mutation. This is a UX safeguard only — the backend's
  // ALLOWED_TRANSITIONS map is what actually enforces the transition is
  // legal, independent of whether this dialog was shown or skipped.
  const [pendingCloseStatus, setPendingCloseStatus] = useState(null);

  const handleStatusChange = (newStatus) => {
    if (newStatus === ticket.status) return;
    if (newStatus === 'CLOSED') {
      setPendingCloseStatus(newStatus);
      return;
    }
    updateTicket.mutate({ status: newStatus });
  };

  const confirmClose = () => {
    updateTicket.mutate(
      { status: pendingCloseStatus },
      { onSettled: () => setPendingCloseStatus(null) }
    );
  };

  const cancelClose = () => setPendingCloseStatus(null);

  return (
    <div className="card space-y-4 p-4">
      <h3 className="text-sm font-semibold text-gray-900">Ticket Controls</h3>

      <Select
        label="Status"
        value={ticket.status}
        disabled={!canManage || nextStatuses.length === 0}
        onChange={(e) => handleStatusChange(e.target.value)}
      >
        <option value={ticket.status}>{STATUS_LABELS[ticket.status]} (current)</option>
        {nextStatuses.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </Select>
      {canManage && isClosed && (
        <p className="-mt-2 text-xs text-gray-400">Reopen this ticket to unlock priority and assignment changes.</p>
      )}

      <Select
        label="Priority"
        value={ticket.priority}
        disabled={!canManage || isClosed}
        onChange={(e) => updateTicket.mutate({ priority: e.target.value })}
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>

      {/* Admins get the full reassign-to-anyone dropdown. Agents get a
          read-only display of the current assignee plus explicit
          assign-to-me / unassign-myself actions below. */}
      {isAdmin ? (
        <Select
          label="Assigned agent"
          value={ticket.assignedTo?.id || ''}
          disabled={isClosed}
          onChange={(e) => assignTicket.mutate(e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Assigned agent</label>
          <p className="input flex items-center bg-gray-50 text-gray-600">
            {ticket.assignedTo?.name || 'Unassigned'}
          </p>
        </div>
      )}

      {isAgent && !isAssignedToMe && !isClosed && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          isLoading={assignTicket.isPending}
          onClick={() => assignTicket.mutate(user.id)}
        >
          <UserCheck className="h-3.5 w-3.5" /> Assign to me
        </Button>
      )}

      {isAgent && isAssignedToMe && !isClosed && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          isLoading={assignTicket.isPending}
          onClick={() => assignTicket.mutate(null)}
        >
          <UserX className="h-3.5 w-3.5" /> Unassign myself
        </Button>
      )}

      {!canManage && (
        <p className="text-xs text-gray-400">Only agents or admins can change these fields.</p>
      )}
      {canManage && isClosed && <p role="status" className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">This ticket is closed. Reopen it before changing priority or assignment.</p>}

      <ConfirmDialog
        open={pendingCloseStatus !== null}
        title="Complete this ticket?"
        description="Please confirm that you have completed the required work, provided the necessary details, and are ready to close this ticket."
        confirmLabel="Yes, Close Ticket"
        isLoading={updateTicket.isPending}
        onCancel={cancelClose}
        onConfirm={confirmClose}
      />
    </div>
  );
}
