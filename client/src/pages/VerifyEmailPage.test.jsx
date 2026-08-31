import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from './VerifyEmailPage';
import { authApi } from '../api/auth.api';

vi.mock('../api/auth.api', () => ({ authApi: { verifyEmail: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="verification-location">{location.pathname}{location.search}</span>;
}

afterEach(cleanup);

describe('VerifyEmailPage', () => {
  it('submits a token once under StrictMode and displays idempotent verification as success', async () => {
    authApi.verifyEmail.mockRejectedValue({ response: { data: { message: 'Email is already verified.' } } });

    render(<StrictMode><MemoryRouter initialEntries={['/verify-email?token=strict-mode-token']}><VerifyEmailPage /><LocationProbe /></MemoryRouter></StrictMode>);

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(screen.getByText('Email is already verified.')).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('verification-location')).toHaveTextContent('/verify-email');
    expect(screen.getByTestId('verification-location')).not.toHaveTextContent('token=');
  });

  it('keeps the loading state, then shows an expired-link failure and registration navigation', async () => {
    let rejectVerification;
    authApi.verifyEmail.mockImplementation(() => new Promise((_, reject) => { rejectVerification = reject; }));

    render(<MemoryRouter initialEntries={['/verify-email?token=expired-token']}><VerifyEmailPage /></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent('Verifying your email…');
    rejectVerification({ response: { data: { message: 'This verification link has expired. Please request a new one.' } } });

    expect(await screen.findByRole('heading', { name: 'Verification failed' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This verification link has expired. Please request a new one.');
    expect(screen.getByRole('link', { name: 'Back to registration' })).toHaveAttribute('href', '/register');
  });

  it('shows an invalid-link failure when no usable verification token exists', async () => {
    render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmailPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Verification failed' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This verification link is missing its token.');
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});
