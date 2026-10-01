import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
afterEach(() => cleanup());
import SlaBadge from './SlaBadge';

const sla = {
  serverNow: '2026-09-09T12:00:00.000Z',
  firstResponse: { state: 'DUE_SOON', remainingSeconds: 90, dueAt: '2026-09-09T12:01:30.000Z', paused: false },
  resolution: { state: 'ON_TRACK', remainingSeconds: 900, dueAt: '2026-09-09T12:15:00.000Z', paused: false },
};

describe('SlaBadge', () => {
  it('renders a semantic state and countdown for support roles', () => {
    render(<SlaBadge sla={sla} role="AGENT" showCountdown label="First response" />);

    expect(screen.getByText(/First response: Due soon/)).toBeInTheDocument();
    expect(screen.getByText(/remaining/)).toBeInTheDocument();
    expect(screen.getByText(/First response: Due soon/).parentElement).toHaveAttribute('data-sla-state', 'DUE_SOON');
    expect(screen.getByText(/First response: Due soon/).parentElement).not.toHaveAttribute('aria-label');
  });

  it('does not expose staff SLA state to requesters or while role is unavailable', () => {
    const { rerender } = render(<SlaBadge sla={sla} role="USER" />);
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
    rerender(<SlaBadge sla={sla} />);
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
  });

  it.each([
    ['PAUSED', 'Paused'],
    ['MET', 'Met'],
    ['COMPLETED_BREACHED', 'Completed breached'],
    ['NOT_APPLICABLE', 'Not applicable'],
  ])('renders the server-provided %s state without deriving a new state', (state, label) => {
    const { container } = render(<SlaBadge role="ADMIN" sla={{ firstResponse: { state, remainingSeconds: 0, paused: state === 'PAUSED' } }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`[data-sla-state="${state}"]`)).toBeInTheDocument();
  });
});
