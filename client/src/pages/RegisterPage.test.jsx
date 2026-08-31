import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

afterEach(cleanup);

function CheckEmailStateProbe() {
  const location = useLocation();
  return <pre data-testid="check-email-state">{JSON.stringify(location.state)}</pre>;
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the delivery state to the check-email page without retaining the password', async () => {
    useAuth.mockReturnValue({
      register: vi.fn().mockResolvedValue({
        email: 'person@example.com',
        delivery: { status: 'failed' },
        message: 'Account created.',
      }),
    });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/check-email" element={<CheckEmailStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Person Example' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-for-route-state' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'));

    const state = JSON.parse(await screen.findByTestId('check-email-state').then((element) => element.textContent));
    expect(state).toEqual({
      email: 'person@example.com',
      delivery: { status: 'failed' },
      message: 'Account created.',
    });
    expect(JSON.stringify(state)).not.toContain('not-for-route-state');
  });
});
