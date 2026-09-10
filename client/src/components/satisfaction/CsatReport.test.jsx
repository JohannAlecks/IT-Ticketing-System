import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import CsatReport from './CsatReport';
const state = vi.hoisted(() => ({ user: { id: 'agent' }, role: 'AGENT' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state }));
vi.mock('../../hooks/useSatisfaction', () => ({ useCsatReport: () => ({ data: { average: null, responses: 0, distribution: {}, feedback: [], trend: [], pagination: { totalPages: 0 } } }) }));
afterEach(cleanup);
it('shows honest empty personal metrics without an Agent leaderboard', () => {
  state.role = 'AGENT'; render(<CsatReport />);
  expect(screen.getByText('Not enough feedback')).toBeInTheDocument();
  expect(screen.getByText('My support satisfaction')).toBeInTheDocument();
  expect(screen.queryByText('Attributed Agent / department')).not.toBeInTheDocument();
});
it('Admin sees aggregate trend controls and USER sees no service metrics', () => {
  state.role = 'ADMIN'; const view = render(<CsatReport />);
  expect(screen.getByText('Daily satisfaction trend (UTC)')).toBeInTheDocument();
  state.role = 'USER'; view.rerender(<CsatReport />);
  expect(screen.queryByText('Service-wide satisfaction')).not.toBeInTheDocument();
});
