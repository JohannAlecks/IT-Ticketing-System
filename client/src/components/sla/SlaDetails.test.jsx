import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
afterEach(() => cleanup());
import SlaDetails from './SlaDetails';

const staffSla = {
  serverNow: '2026-09-09T12:00:00.000Z',
  timeModel: '24/7 elapsed time',
  policyName: 'High priority',
  pendingReason: 'WAITING_FOR_REQUESTER',
  firstResponse: {
    state: 'MET',
    dueAt: '2026-09-09T12:01:00.000Z',
    completedAt: '2026-09-09T11:59:00.000Z',
    remainingSeconds: 0,
    paused: false,
  },
  resolution: {
    state: 'PAUSED',
    dueAt: '2026-09-09T12:30:00.000Z',
    completedAt: null,
    remainingSeconds: 900,
    paused: true,
  },
};

describe('SlaDetails', () => {
  it('shows staff milestones, outcomes, policy, time model, and pause reason', () => {
    render(<SlaDetails role="AGENT" ticket={{ status: 'PENDING', pendingReason: 'WAITING_FOR_REQUESTER' }} sla={staffSla} />);

    expect(screen.getByRole('heading', { name: 'SLA details' })).toBeInTheDocument();
    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('24/7 elapsed time')).toBeInTheDocument();
    expect(screen.getByText('Waiting for requester')).toBeInTheDocument();
    expect(screen.getByText(/completed/)).toBeInTheDocument();
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  });

  it('shows only requester-safe first-response wording for users', () => {
    render(<SlaDetails role="USER" ticket={{ status: 'OPEN' }} sla={{
      serverNow: staffSla.serverNow,
      firstResponse: { dueAt: '2026-09-09T12:10:00.000Z', completedAt: null },
      requesterMessage: 'Expected first response by the shown time.',
      resolution: { state: 'BREACHED' },
    }} />);

    expect(screen.getByRole('heading', { name: 'Support response' })).toBeInTheDocument();
    expect(screen.getByText('Expected first response by the shown time.')).toBeInTheDocument();
    expect(screen.queryByText('SLA details')).not.toBeInTheDocument();
    expect(screen.queryByText('Breached')).not.toBeInTheDocument();
  });
});
