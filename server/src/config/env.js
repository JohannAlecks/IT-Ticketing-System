require('dotenv').config();
const { isIP } = require('node:net');

const required = ['DATABASE_URL', 'JWT_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});

const NODE_ENV = process.env.NODE_ENV || 'development';
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'disabled').trim().toLowerCase();
const EMAIL_PROVIDERS = new Set(['disabled', 'resend']);

function invalid(message) { throw new Error(`Invalid email configuration: ${message}`); }

const EMAIL_ADDRESS_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function isEmailAddress(value) {
  const [localPart] = value.split('@');
  return value.length <= 254
    && localPart?.length <= 64
    && !localPart.startsWith('.')
    && !localPart.endsWith('.')
    && !localPart.includes('..')
    && !CONTROL_CHARACTER_PATTERN.test(value)
    && EMAIL_ADDRESS_PATTERN.test(value);
}

function emailValue(name, { required: isRequired = false } = {}) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (isRequired) invalid(`Missing required env var: ${name}`);
    return null;
  }
  if (!isEmailAddress(value)) invalid(`${name} must be an email address`);
  return value;
}

function senderValue() {
  const value = process.env.EMAIL_FROM?.trim();
  if (!value) {
    if (EMAIL_PROVIDER === 'resend') invalid('Missing required env var: EMAIL_FROM');
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) invalid('EMAIL_FROM must be an email address or Name <email> sender');
  const namedSender = value.match(/^([^<>]{1,100})\s*<([^<>]+)>$/);
  const address = namedSender ? namedSender[2].trim() : value;
  if ((namedSender && !namedSender[1].trim()) || !isEmailAddress(address)) {
    invalid('EMAIL_FROM must be an email address or Name <email> sender');
  }
  return value;
}

function safeLabelValue(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  if (CONTROL_CHARACTER_PATTERN.test(value) || value.length > 100) invalid(`${name} must be a single-line value no longer than 100 characters`);
  return value;
}

function positiveBoundedNumber(name, fallback, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) invalid(`${name} must be a positive integer no greater than ${maximum}`);
  return value;
}

function clientUrlValue() {
  const value = process.env.CLIENT_URL?.trim() || 'http://localhost:5173';
  let parsed;
  try { parsed = new URL(value); } catch { invalid('CLIENT_URL must be a valid http(s) URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    invalid('CLIENT_URL must be an http(s) URL without credentials, query, or hash');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const ipVersion = isIP(hostname);
  const ipv4Parts = ipVersion === 4 ? hostname.split('.').map(Number) : [];
  const isPrivateIpv4 = ipVersion === 4 && (
    ipv4Parts[0] === 0
    || ipv4Parts[0] === 10
    || ipv4Parts[0] === 127
    || (ipv4Parts[0] === 100 && ipv4Parts[1] >= 64 && ipv4Parts[1] <= 127)
    || (ipv4Parts[0] === 169 && ipv4Parts[1] === 254)
    || (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31)
    || (ipv4Parts[0] === 192 && ipv4Parts[1] === 168)
    || (ipv4Parts[0] === 198 && [18, 19].includes(ipv4Parts[1]))
    || ipv4Parts[0] >= 224
  );
  const isPrivateIpv6 = ipVersion === 6 && (
    hostname === '::'
    || hostname === '::1'
    || /^f[cd]/.test(hostname)
    || /^fe[89ab]/.test(hostname)
    || hostname.startsWith('::ffff:')
  );
  const isLocalName = hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal') || (!ipVersion && !hostname.includes('.'));
  if (NODE_ENV === 'production' && (parsed.protocol !== 'https:' || isLocalName || isPrivateIpv4 || isPrivateIpv6)) {
    invalid('Production CLIENT_URL must use trusted HTTPS and a non-localhost, non-private host');
  }
  return parsed.toString().replace(/\/$/, '');
}

if (!EMAIL_PROVIDERS.has(EMAIL_PROVIDER)) invalid('EMAIL_PROVIDER must be exactly disabled or resend');
if (NODE_ENV === 'production' && EMAIL_PROVIDER !== 'resend') invalid('Production requires EMAIL_PROVIDER=resend');

const EMAIL_FROM = senderValue();
const EMAIL_REPLY_TO = emailValue('EMAIL_REPLY_TO');
const EMAIL_SUPPORT = emailValue('EMAIL_SUPPORT');
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || null;
if (EMAIL_PROVIDER === 'resend' && !RESEND_API_KEY) invalid('Missing required env var: RESEND_API_KEY');
const CLIENT_URL = clientUrlValue();

module.exports = {
  NODE_ENV,
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  CLIENT_URL,
  CORS_ORIGINS: (process.env.CORS_ORIGINS || CLIENT_URL).split(',').map((value) => value.trim()).filter(Boolean),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  LOG_FORMAT: process.env.LOG_FORMAT || (NODE_ENV === 'production' ? 'json' : 'pretty'),
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  AUTH_RATE_LIMIT_MAX: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  API_RATE_LIMIT_WINDOW_MS: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  API_RATE_LIMIT_MAX: Number(process.env.API_RATE_LIMIT_MAX) || 120,
  MAX_ATTACHMENT_SIZE_MB: Number(process.env.MAX_ATTACHMENT_SIZE_MB) || 5,
  ALLOWED_ATTACHMENT_MIME_TYPES: process.env.ALLOWED_ATTACHMENT_MIME_TYPES || null,
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  EMAIL_PROVIDER,
  RESEND_API_KEY,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  EMAIL_SUPPORT,
  EMAIL_APP_NAME: safeLabelValue('EMAIL_APP_NAME', 'HelpDesk'),
  EMAIL_DELIVERY_TIMEOUT_MS: positiveBoundedNumber('EMAIL_DELIVERY_TIMEOUT_MS', 10000, 120000),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: positiveBoundedNumber('EMAIL_VERIFICATION_TOKEN_TTL_HOURS', 24, 720),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: positiveBoundedNumber('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60, 86400),
};
