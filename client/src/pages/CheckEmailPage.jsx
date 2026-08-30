import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { authApi } from '../api/auth.api';
import Button from '../components/ui/Button';

export default function CheckEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const registrationMessage = location.state?.message;
  const [isResending, setIsResending] = useState(false);

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
    try {
      const result = await authApi.resendVerification(email);
      // The backend deliberately returns the same generic message whether
      // or not the account exists/is already verified — don't editorialize
      // on top of it.
      toast.success(result.message);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't resend the email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <MailCheck className="h-6 w-6" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Account created</h1>
        <p className="mt-2 text-sm text-gray-500">
          {registrationMessage || (
            <>Verification is required for <span className="font-medium text-gray-700">{email}</span>. Request a verification email when delivery is available.</>
          )}
        </p>

        <div className="mt-6 space-y-3">
          <Button variant="secondary" className="w-full" isLoading={isResending} onClick={handleResend}>
            Resend verification email
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
