const { Resend } = require('resend');
const env = require('../config/env');

const RESEND_API_URL = 'https://api.resend.com';

function withTimeout(operation, milliseconds) {
  let timeout;
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('email delivery timed out'));
    }, milliseconds);
    Promise.resolve().then(() => operation(controller.signal)).then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}

// Public facade: callers receive only a safe, status-level delivery result.
async function sendMail({ to, subject, html, text, idempotencyKey }) {
  if (env.EMAIL_PROVIDER === 'disabled') return { status: 'unavailable' };
  try {
    // Pin the official endpoint so ambient SDK-specific environment values
    // cannot redirect a credential. The SDK otherwise logs provider details
    // outside production, so replace that diagnostic with the app's safe status.
    const resend = new Resend(env.RESEND_API_KEY, { baseUrl: RESEND_API_URL });
    resend.logError = () => {};
    const response = await withTimeout(
      (signal) => resend.emails.send({
        from: env.EMAIL_FROM, to, subject, html, text,
        ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
      }, { idempotencyKey, signal }),
      env.EMAIL_DELIVERY_TIMEOUT_MS
    );
    if (response?.error || !response?.data?.id) return { status: 'failed' };
    return { status: 'accepted' };
  } catch {
    return { status: 'failed' };
  }
}

module.exports = { sendMail };
