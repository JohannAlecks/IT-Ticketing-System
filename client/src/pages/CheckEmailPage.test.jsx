import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import CheckEmailPage from './CheckEmailPage';
import { authApi } from '../api/auth.api';

vi.mock('../api/auth.api', () => ({ authApi: { resendVerification: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

function renderCheckEmail(deliveryStatus = 'accepted') {
  return render(
    <MemoryRouter initialEntries={[{
      pathname: '/check-email',
      state: { email: 'person@example.com', delivery: { status: deliveryStatus } },
    }]}>
      <Routes><Route path="/check-email" element={<CheckEmailPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('CheckEmailPage delivery states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['accepted', 'Verification email request accepted', 'does not guarantee that the email reached your inbox'],
    ['unavailable', 'Email delivery is unavailable', 'email delivery is not available in this environment'],
    ['failed', 'Verification email request failed', 'verification email request could not be completed'],
  ])('displays the %s registration delivery state', (status, title, description) => {
    renderCheckEmail(status);

    const deliveryStatus = screen.getByRole('status', { name: 'Email delivery status' });
    expect(deliveryStatus).toHaveTextContent(title);
    expect(deliveryStatus).toHaveTextContent(description);
  });

  it('shows the resend response verbatim without treating it as delivery confirmation', async () => {
    const genericMessage = 'If an eligible account exists, a verification email may be sent when email delivery is available.';
    authApi.resendVerification.mockResolvedValue({ message: genericMessage, retryAfterSeconds: 60 });
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByText(new RegExp(genericMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(/does not confirm that an account exists or that an email was delivered/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again in 60s' })).toBeDisabled();
    expect(toast.success).toHaveBeenCalledWith(genericMessage);
  });
});
