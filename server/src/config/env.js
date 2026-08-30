require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
});

const NODE_ENV = process.env.NODE_ENV || 'development';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER?.trim() || null;

// Verification is mandatory for newly registered accounts. This project has
// intentionally not selected or implemented a production mail provider, so
// letting a production process start would create accounts that cannot finish
// onboarding. Fail before the listener is opened instead.
if (NODE_ENV === 'production') {
  if (!EMAIL_PROVIDER) {
    throw new Error('Production startup blocked: email verification requires a configured provider, but no production email provider is implemented.');
  }
  throw new Error('Production startup blocked: EMAIL_PROVIDER is configured, but no production email provider is implemented.');
}

module.exports = {
  NODE_ENV,
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  LOG_FORMAT: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  AUTH_RATE_LIMIT_MAX: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  API_RATE_LIMIT_WINDOW_MS: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  API_RATE_LIMIT_MAX: Number(process.env.API_RATE_LIMIT_MAX) || 120,
  MAX_ATTACHMENT_SIZE_MB: Number(process.env.MAX_ATTACHMENT_SIZE_MB) || 5,
  ALLOWED_ATTACHMENT_MIME_TYPES: process.env.ALLOWED_ATTACHMENT_MIME_TYPES || null,
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',

  // Email verification is deliberately development-only until a provider is
  // selected and implemented. See src/utils/mailer.js.
  EMAIL_PROVIDER,
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS) || 24,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS) || 60,
};
