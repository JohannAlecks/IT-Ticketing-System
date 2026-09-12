const { Resend } = require('resend');
const env = require('../config/env');
const emailLogs = require('../modules/emailLogs/emailLog.service');
const { z } = require('zod');

const RESEND_API_URL = 'https://api.resend.com';

function withTimeout(operation, milliseconds) {
  let timeout;
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('Email outcome unknown'), { code: 'EMAIL_TIMEOUT' }));
    }, milliseconds);
    Promise.resolve().then(() => operation(controller.signal)).then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}

// Public facade: callers receive only a safe, status-level delivery result.
async function sendMail({ to, subject, html, text, idempotencyKey, messageType }) {
  let attempt;
  try { attempt = await emailLogs.begin({ to, messageType, idempotencyKey }); }
  catch { return { status: 'failed' }; } // No log reservation => no provider call.
  const publicStatus = (status) => ({ DISABLED: 'unavailable', ACCEPTED: 'accepted', UNKNOWN: 'unknown', FAILED: 'failed' })[status] || 'unknown';
  if (!attempt.shouldSend) return { status: publicStatus(attempt.row.status) };
  let outcome;
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
    const code = response?.error?.statusCode;
    if (response?.error) {
      // A timeout, transport error, 5xx or ambiguous response may follow an
      // accepted request. Never turn missing evidence into a delivery claim.
      outcome = Number.isInteger(code) && code >= 400 && code < 500 && ![408, 409].includes(code)
        ? { status: 'FAILED', errorCategory: 'PROVIDER_REJECTED' }
        : { status: 'UNKNOWN', errorCategory: 'TRANSPORT_ERROR' };
    } else if (z.string().uuid().safeParse(response?.data?.id).success) {
      outcome = { status: 'ACCEPTED', providerMessageId: response.data.id };
    } else outcome = { status: 'UNKNOWN', errorCategory: 'INVALID_RESPONSE' };
  } catch (error) {
    outcome = { status: 'UNKNOWN', errorCategory: error?.code === 'EMAIL_TIMEOUT' ? 'TIMEOUT' : 'TRANSPORT_ERROR' };
  }
  // Provider I/O is not atomic with PostgreSQL. On a logging failure the
  // reserved row remains UNKNOWN; do not retry or misreport delivery.
  await emailLogs.finish(attempt.row.id, outcome);
  return { status: publicStatus(outcome.status) };
}

module.exports = { sendMail };
