import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import TicketSatisfaction, { FeedbackCycle } from './TicketSatisfaction';
const state = vi.hoisted(() => ({ user: { id: 'u' }, role: 'USER', query: {}, mutation: { mutateAsync: vi.fn(), isPending: false } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state }));
vi.mock('../../hooks/useSatisfaction', () => ({ useSatisfaction: () => state.query, useSaveSatisfaction: () => state.mutation }));
const cycle = { id: 'cycle', number: 1, resolvedAt: '2026-09-10T00:00:00Z', expiresAt: '2026-09-24T00:00:00Z', canWrite: true, state: 'OPEN', editToken: 'v0', feedback: null };
beforeEach(() => { vi.clearAllMocks(); state.user = { id: 'u' }; state.role = 'USER'; state.mutation.isPending = false; state.query = { data: { cycles: [], pagination: {} } }; });
afterEach(cleanup);
describe('CSAT ticket detail', () => {
  it('renders five labeled native radios and constrained optional feedback', () => {
    render(<FeedbackCycle cycle={cycle} ticketId="t" />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    const rating = screen.getByRole('radio', { name: '4 — Satisfied' });
    rating.focus(); expect(document.activeElement).toBe(rating);
    fireEvent.click(rating); expect(rating.checked).toBe(true);
    expect(screen.getByLabelText('Optional written feedback')).toHaveAttribute('maxLength', '1000');
    expect(screen.getByText(/Feedback deadline/)).toBeInTheDocument();
  });
  it('preserves entries after API failure and keeps its original token after polling', async () => {
    state.mutation.mutateAsync.mockRejectedValue({ response: { data: { message: 'Retry later' } } });
    const view = render(<FeedbackCycle cycle={cycle} ticketId="t" />);
    fireEvent.click(screen.getByRole('radio', { name: '5 — Very satisfied' }));
    fireEvent.change(screen.getByLabelText('Optional written feedback'), { target: { value: 'My draft' } });
    view.rerender(<FeedbackCycle cycle={{ ...cycle, editToken: 'newer' }} ticketId="t" />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Optional written feedback')).toHaveValue('My draft');
    expect(state.mutation.mutateAsync).toHaveBeenCalledWith({ payload: { rating: 5, comment: 'My draft' }, token: 'v0', update: false });
  });
  it('shows saved feedback and switches to updating after success', async () => {
    state.mutation.mutateAsync.mockResolvedValue({ ...cycle, feedback: { rating: 4, comment: 'Thank you', version: 1 }, editToken: 'v1' });
    render(<FeedbackCycle cycle={cycle} ticketId="t" />);
    fireEvent.click(screen.getByRole('radio', { name: '4 — Satisfied' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }));
    await screen.findByText('Feedback saved.');
    expect(screen.getByText(/Saved rating: 4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update feedback' })).toBeInTheDocument();
  });
  it('shows newer polled feedback without replacing the draft or upgrading its token', async () => {
    state.mutation.mutateAsync.mockRejectedValue({ response: { data: { message: 'Reload feedback' } } });
    const initial = { ...cycle, editToken: 'v1', feedback: { rating: 2, comment: 'Original', version: 1 } };
    const view = render(<FeedbackCycle cycle={initial} ticketId="t" />);
    fireEvent.change(screen.getByLabelText('Optional written feedback'), { target: { value: 'Unsaved draft' } });
    const updated = { ...initial, editToken: 'v2', feedback: { rating: 5, comment: 'Saved in another tab', version: 2 } };
    view.rerender(<FeedbackCycle cycle={updated} ticketId="t" />);
    expect(screen.getByText(/Saved rating: 5/)).toBeInTheDocument();
    expect(screen.getByText('Saved in another tab')).toBeInTheDocument();
    expect(screen.getByLabelText('Optional written feedback')).toHaveValue('Unsaved draft');
    fireEvent.click(screen.getByRole('button', { name: 'Update feedback' }));
    await screen.findByRole('alert');
    expect(state.mutation.mutateAsync).toHaveBeenCalledWith({ payload: { rating: 2, comment: 'Unsaved draft' }, token: 'v1', update: true });
    view.rerender(<FeedbackCycle cycle={{ ...updated, canWrite: false, state: 'EXPIRED' }} ticketId="t" />);
    expect(screen.getByText(/Saved rating: 5/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
  it.each(['EXPIRED', 'HISTORICAL'])('%s feedback stays read-only', (status) => {
    render(<FeedbackCycle cycle={{ ...cycle, state: status, canWrite: false, feedback: { rating: 2, comment: 'Historical comment' } }} ticketId="t" />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Historical comment')).toBeInTheDocument();
  });
  it('active ticket has no new form, but preserves prior feedback after reopening', () => {
    const view = render(<TicketSatisfaction ticket={{ id: 't', status: 'OPEN' }} />);
    expect(screen.queryByText('Support satisfaction')).not.toBeInTheDocument();
    state.query.data.cycles = [{ ...cycle, canWrite: false, state: 'HISTORICAL', feedback: { rating: 3 } }];
    view.rerender(<TicketSatisfaction ticket={{ id: 't', status: 'OPEN' }} />);
    expect(screen.getByText('Previous-cycle feedback is read-only.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
  it('disabled saving controls and role-projected read-only data are respected', () => {
    state.mutation.isPending = true;
    const view = render(<FeedbackCycle cycle={cycle} ticketId="t" />);
    expect(screen.getByRole('radio', { name: '1 — Very dissatisfied' })).toBeDisabled();
    view.rerender(<FeedbackCycle cycle={{ ...cycle, canWrite: false }} ticketId="t" />);
    expect(screen.queryByRole('button', { name: 'Submit feedback' })).not.toBeInTheDocument();
  });
});
