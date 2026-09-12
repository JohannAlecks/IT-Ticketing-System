import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EmailLogsPage from './EmailLogsPage';
const state = vi.hoisted(() => ({ role: 'ADMIN', user: { id: 'admin' }, requests: [], refetch: vi.fn(), mode: 'success' }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row = { id, recipientMasked: 'p***@e***.***', provider: 'RESEND', status: 'ACCEPTED', messageType: 'EMAIL_VERIFICATION', createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:01Z', acceptedAt: '2026-09-12T00:00:01Z', attemptCount: 1 };
vi.mock('../context/AuthContext', () => ({ useAuth: () => state }));
vi.mock('../hooks/useEmailLogs', () => ({ useEmailLogs: (params, detailId) => {
  state.requests.push({ params, id: detailId });
  return { refetch: state.refetch, isPending: state.mode === 'loading', isError: state.mode === 'error', data: state.mode !== 'success' && state.mode !== 'empty' ? undefined : detailId ? row : { provider: 'disabled', counts: { DISABLED: 2, ACCEPTED: 1 }, logs: state.mode === 'empty' ? [] : [row], pagination: { total: 3, totalPages: 2 } } };
} }));
beforeEach(() => { vi.clearAllMocks(); state.role = 'ADMIN'; state.user = { id: 'admin' }; state.mode = 'success'; state.requests = []; }); afterEach(cleanup);
const show = () => render(<MemoryRouter><Routes><Route path="/" element={<EmailLogsPage />} /><Route path="/dashboard" element={<p>Safe dashboard</p>} /></Routes></MemoryRouter>);
it.each(['USER', 'AGENT'])('%s has no email-log UI or request', (role) => { state.role = role; show(); expect(screen.getByText('Safe dashboard')).toBeInTheDocument(); expect(state.requests).toHaveLength(0); });
it('honest disabled banner, masked table, accessible safe detail and no resend action', () => {
  show(); expect(screen.getByText('Email delivery is disabled')).toBeInTheDocument(); expect(screen.getByText('p***@e***.***')).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveAccessibleName(/recipients are masked/);
  fireEvent.click(screen.getByRole('button', { name: `View email log ${id}` }));
  const dialog = screen.getByRole('dialog', { name: 'Email log details' }); expect(within(dialog).getByText(/not proof of delivery/)).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /resend|retry/i })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Email log details' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('strict ID search, date/type/status filters and bounded pagination', () => {
  show(); fireEvent.change(screen.getByLabelText('Exact log ID'), { target: { value: 'person@example.test' } }); fireEvent.click(screen.getByRole('button', { name: 'Find log' })); expect(screen.getByRole('alert')).toHaveTextContent('valid log ID');
  fireEvent.change(screen.getByLabelText('Exact log ID'), { target: { value: id } }); fireEvent.click(screen.getByRole('button', { name: 'Find log' }));
  fireEvent.change(screen.getByLabelText('Email type'), { target: { value: 'EMAIL_VERIFICATION' } });
  fireEvent.change(screen.getByLabelText('Email status'), { target: { value: 'UNKNOWN' } });
  fireEvent.change(screen.getByLabelText('Created from (UTC)'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Created through (UTC)'), { target: { value: '2026-09-12' } });
  expect(state.requests.at(-1).params).toMatchObject({ id, messageType: 'EMAIL_VERIFICATION', status: 'UNKNOWN', from: '2026-09-01', to: '2026-09-12', page: 1, limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); expect(state.requests.at(-1).params.page).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); expect(state.requests.at(-1).params).toEqual({ page: 1, limit: 20 });
});
it.each(['loading', 'error', 'empty'])('supports %s without claiming delivery', (mode) => {
  state.mode = mode; show();
  if (mode === 'loading') expect(screen.getByRole('status')).toHaveTextContent('Loading email logs');
  if (mode === 'error') { fireEvent.click(screen.getByRole('button', { name: 'Retry logs' })); expect(state.refetch).toHaveBeenCalled(); }
  if (mode === 'empty') expect(screen.getByText(/No matching email logs/)).toBeInTheDocument();
});
