const env = require('../config/env');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function verificationUrl(rawToken) {
  const base = new URL(`${env.CLIENT_URL}/`);
  const url = new URL('verify-email', base);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

function buildVerificationEmail(user, rawToken) {
  const appName = env.EMAIL_APP_NAME;
  const safeName = escapeHtml(user.name);
  const safeAppName = escapeHtml(appName);
  const url = verificationUrl(rawToken);
  const ttlHours = env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
  const support = env.EMAIL_SUPPORT ? `\nNeed help? Contact ${env.EMAIL_SUPPORT}.` : '';
  const supportHtml = env.EMAIL_SUPPORT ? `<p>Need help? Contact <a href="mailto:${escapeHtml(env.EMAIL_SUPPORT)}">${escapeHtml(env.EMAIL_SUPPORT)}</a>.</p>` : '';
  return {
    to: user.email,
    subject: `Verify your ${appName} account`,
    text: `Hi ${user.name},\n\nVerify your ${appName} email address: ${url}\n\nThis link expires in ${ttlHours} hours and can only be used once. If you did not create this account, you can safely ignore this email.${support}`,
    html: `<!doctype html><html lang="en"><body><main><p>Hi ${safeName},</p><p>Verify your email address to finish setting up your ${safeAppName} account.</p><p><a href="${escapeHtml(url)}">Verify email address</a></p><p>If the button does not work, copy and paste this URL into your browser:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>This link expires in ${ttlHours} hours and can only be used once.</p><p>If you did not create this account, you can safely ignore this email.</p>${supportHtml}</main></body></html>`,
  };
}

module.exports = { buildVerificationEmail, escapeHtml, verificationUrl };
