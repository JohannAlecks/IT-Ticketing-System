import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth.api';
import Button from '../components/ui/Button';

const verificationRequests = new Map();
const SUCCESS_MESSAGE = 'Email verified successfully. You can now log in.';

// React StrictMode intentionally runs effects twice in development. Sharing a
// request per token keeps that diagnostic behavior from consuming the same
// verification link twice, while a failed transient request remains retryable.
export function verifyEmailOnce(token) {
  if (!verificationRequests.has(token)) {
    const request = authApi.verifyEmail(token).catch((error) => {
      verificationRequests.delete(token);
      throw error;
    });
    verificationRequests.set(token, request);
  }
  return verificationRequests.get(token);
}

export function isAlreadyVerifiedError(error) {
  const message = error?.response?.data?.message || error?.message || '';
  return /already\s+verified/i.test(message);
}

// States: 'verifying' (in flight) -> 'success' | 'error'
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isCurrent = true;
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return () => { isCurrent = false; };
    }
    verifyEmailOnce(token)
      .then((result) => {
        if (!isCurrent) return;
        setStatus('success');
        setMessage(result?.message || SUCCESS_MESSAGE);
      })
      .catch((err) => {
        if (!isCurrent) return;
        if (isAlreadyVerifiedError(err)) {
          setStatus('success');
          setMessage(err.response?.data?.message || SUCCESS_MESSAGE);
          return;
        }
        setStatus('error');
        // Surfaces the backend's specific reason: invalid, expired, or
        // already-used — each has a distinct message from verifyEmail().
        setMessage(err.response?.data?.message || "This verification link didn't work.");
      });
    return () => { isCurrent = false; };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        {status === 'verifying' && (
          <>
            <div className="mb-4 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
            <p className="text-sm text-gray-500">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Email verified</h1>
            <p className="mt-2 text-sm text-gray-500">{message}</p>
            <Link to="/login">
              <Button className="mt-6 w-full">Go to login</Button>
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
                <XCircle className="h-6 w-6" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Verification failed</h1>
            <p className="mt-2 text-sm text-gray-500">{message}</p>
            <Link to="/register">
              <Button variant="secondary" className="mt-6 w-full">Back to registration</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
