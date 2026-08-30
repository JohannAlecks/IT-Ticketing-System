const env = require('../config/env');

/**
 * Email sending abstraction — see README "Email Verification" section for
 * full context. THIS PROJECT HAS NO EMAIL PROVIDER CONFIGURED.
 *
 * No email-sending package (nodemailer, @sendgrid/mail, resend, etc.) has
 * been installed, and no SMTP/API credentials exist in .env.example. This
 * was a deliberate choice, not an oversight: introducing a specific
 * provider is a decision (SMTP vs. a transactional API, which vendor,
 * which npm package) that belongs to whoever owns the production
 * deployment, not something to guess at.
 *
 * What THIS file does instead: expose a single `sendMail()` function with
 * the exact interface a real provider integration would use, so swapping in
 * real delivery later is isolated. It intentionally never logs message
 * content, recipients, verification URLs, or raw tokens.
 *
 * TO WIRE UP A REAL PROVIDER:
 * 1. Pick one (e.g. nodemailer+SMTP, Resend, SendGrid, AWS SES) and
 *    `npm install` the relevant package in server/.
 * 2. Add its credentials to deployment-only configuration — never commit
 *    real credentials.
 * 3. Replace the body of `sendMail()` below with a real API/SMTP call.
 *    Every caller (auth.service.js) is already written against this
 *    function's signature and does not need to change.
 */
async function sendMail({ to, subject, html, text }) {
  // Keep the future provider interface explicit while deliberately avoiding
  // any diagnostics that could disclose a verification URL or token.
  void to;
  void subject;
  void html;
  void text;

  const providerConfigured = Boolean(env.EMAIL_PROVIDER);

  if (!providerConfigured) {
    // eslint-disable-next-line no-console
    console.warn('Email delivery is not configured; the verification message was not sent.');
    return { delivered: false, attempted: false, reason: 'no_provider_configured' };
  }

  // No provider is currently wired up, so this branch is intentionally
  // unreachable until EMAIL_PROVIDER is set AND the real implementation
  // below is written in for that provider. Throwing here (rather than
  // silently pretending to succeed) is deliberate: see the class comment.
  throw new Error('Email delivery provider is configured but unsupported: no provider integration has been implemented.');
}

module.exports = { sendMail };
