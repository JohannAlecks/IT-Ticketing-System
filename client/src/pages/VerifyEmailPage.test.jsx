import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from './VerifyEmailPage';
import { authApi } from '../api/auth.api';

vi.mock('../api/auth.api', () => ({ authApi: { verifyEmail: vi.fn() } }));

describe('VerifyEmailPage', () => {
  it('submits a token once under StrictMode and displays idempotent verification as success', async () => {
    authApi.verifyEmail.mockRejectedValue({ response: { data: { message: 'Email is already verified.' } } });

    render(<StrictMode><MemoryRouter initialEntries={['/verify-email?token=strict-mode-token']}><VerifyEmailPage /></MemoryRouter></StrictMode>);

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(screen.getByText('Email is already verified.')).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });
});
