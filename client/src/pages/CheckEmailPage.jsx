import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CircleAlert, CircleX, MailCheck } from 'lucide-react';
import { authApi } from '../api/auth.api';
import Button from '../components/ui/Button';

const DELIVERY_STATES = {
  accepted: {
    icon: MailCheck,
    iconClassName: 'bg-brand-50 text-brand-600',
    title: 'Verification email request accepted',
    description: (email) => <>The email provider accepted a verification request for <span className="font-medium text-gray-700">{email}</span>. This does not guarantee that the email reached your inbox. Check your inbox and spam folder.</>,
  },
  unavailable: {
    icon: CircleAlert,
    iconClassName: 'bg-amber-50 text-amber-700',
    title: 'Email delivery is unavailable',
    description: () => <>Your account was created, but email delivery is not available in this environment. Verification is still required before you can sign in.</>,
  },
  failed: {
    icon: CircleX,
    iconClassName: 'bg-red-50 text-red-600',
    title: 'Verification email request failed',
    description: () => <>Your account was created, but the verification email request could not be completed. Verification is still required before you can sign in. Please try again.</>,
  },
};

export default function CheckEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const deliveryStatus = location.state?.delivery?.status;
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  // No email in route state means someone landed here directly (refresh,
  // bookmarked link, back button) rather than right after registering —
  // send them back to register instead of showing a broken/empty screen.
  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-gray-500">
            Nothing to check here yet. Please{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
              create an account
            </Link>{' '}
            first.
          </p>
        </div>
      </div>
    );
  }

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage('');
    try {
      const result = await authApi.resendVerification(email);
      // The backend deliberately returns the same generic message whether
      // or not the account exists/is already verified. Display it verbatim;
      // it is not evidence that an email was delivered or an account exists.
      setResendMessage(result.message);
      const retryAfterSeconds = Number(result.retryAfterSeconds);
      setCooldownSeconds(Number.isFinite(retryAfterSeconds)
        ? Math.min(86400, Math.max(1, Math.ceil(retryAfterSeconds)))
        : 60);
      toast.success(result.message);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't resend the email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const delivery = DELIVERY_STATES[deliveryStatus] || DELIVERY_STATES.unavailable;
  const DeliveryIcon = delivery.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 flex justify-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${delivery.iconClassName}`}>
            <DeliveryIcon className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Account created</h1>
        <div className="mt-2" role="status" aria-live="polite" aria-label="Email delivery status">
          <h2 className="text-sm font-medium text-gray-700">{delivery.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{delivery.description(email)}</p>
        </div>

        {resendMessage && (
          <p className="mt-4 text-sm text-gray-500" role="status" aria-live="polite">
            {resendMessage} This response does not confirm that an account exists or that an email was delivered.
          </p>
        )}

        <div className="mt-6 space-y-3">
          <Button
            variant="secondary"
            className="w-full"
            isLoading={isResending}
            disabled={cooldownSeconds > 0}
            onClick={handleResend}
          >
            {cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : 'Resend verification email'}
          </Button>
          <button
            onClick={() => navigate('/login')}
            className="w-full text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
