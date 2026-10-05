const { isIP } = require('node:net');
const path = require('node:path');

const reject = (name) => { throw new Error(`Invalid configuration: ${name}`); };
function integer(source, name, fallback, maximum) {
  if (source[name] === undefined || source[name] === '') return fallback;
  const value = Number(source[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) reject(name);
  return value;
}
function origin(value, production) {
  try {
    const url = new URL(value);
    if (value.includes('*') || url.origin !== value || url.username || url.password || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) reject('CORS_ORIGINS');
    return url.origin;
  } catch { reject('CORS_ORIGINS'); }
}
function security(source, clientUrl) {
  const mode = source.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) reject('NODE_ENV');
  const production = mode === 'production';
  if (production) {
    const secret = source.JWT_SECRET || '';
    // Reject obvious weak values without requiring every hex digit to occur in
    // a random secret. Diversity is a heuristic, not a proof of entropy.
    if (Buffer.byteLength(secret) < 48 || new Set(secret).size < 8 || /replace|example|changeme|test[-_ ]|password/i.test(secret)) reject('JWT_SECRET');
    if (!source.CLIENT_URL || !source.CORS_ORIGINS) reject('CLIENT_URL/CORS_ORIGINS');
    const ttl = source.JWT_EXPIRES_IN || '1d';
    const match = /^(\d+)(m|h|d)$/.exec(ttl);
    if (!match || Number(match[1]) < 1 || Number(match[1]) * ({ m: 60, h: 3600, d: 86400 })[match[2]] > 86400) reject('JWT_EXPIRES_IN');
    if (source.STORAGE_PROVIDER !== 'local' || source.ATTACHMENT_STORAGE_PERSISTENT !== 'true' || !source.ATTACHMENT_STORAGE_ROOT || !path.isAbsolute(source.ATTACHMENT_STORAGE_ROOT) || path.resolve(source.ATTACHMENT_STORAGE_ROOT) === path.parse(source.ATTACHMENT_STORAGE_ROOT).root) reject('persistent ATTACHMENT_STORAGE_ROOT/STORAGE_PROVIDER');
  }
  try {
    const url = new URL(source.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) reject('DATABASE_URL');
  } catch { reject('DATABASE_URL'); }
  const origins = (source.CORS_ORIGINS || clientUrl).split(',').map((v) => origin(v.trim(), production));
  let proxy = false;
  if (source.TRUST_PROXY && source.TRUST_PROXY !== 'false') {
    // Only explicitly verified proxy IPs/subnets; never a boolean or hop count.
    proxy = source.TRUST_PROXY.split(',').map((v) => v.trim());
    for (const entry of proxy) {
      const [ip, prefix, extra] = entry.split('/'); const version = isIP(ip);
      if (!version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) reject('TRUST_PROXY');
    }
  }
  const limits = {};
  for (const [name, window, max] of [['AUTH', 900000, 10], ['API', 60000, 120], ['SEARCH', 60000, 60], ['UPLOAD', 60000, 20], ['REPORT', 60000, 30]]) {
    limits[`${name}_RATE_LIMIT_WINDOW_MS`] = integer(source, `${name}_RATE_LIMIT_WINDOW_MS`, window, 86400000);
    limits[`${name}_RATE_LIMIT_MAX`] = integer(source, `${name}_RATE_LIMIT_MAX`, max, 100000);
  }
  if (source.STORAGE_PROVIDER && source.STORAGE_PROVIDER !== 'local') reject('STORAGE_PROVIDER');
  return { ...limits, CORS_ORIGINS: origins, TRUST_PROXY: proxy,
    PORT: integer(source, 'PORT', 5000, 65535),
    MAX_ATTACHMENT_SIZE_MB: integer(source, 'MAX_ATTACHMENT_SIZE_MB', 5, 25),
  };
}
module.exports = { security };
