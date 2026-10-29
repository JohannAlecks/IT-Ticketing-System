// Structured allowlisted evidence only: never forward raw browser/OS messages.
const PHASES = new Set(['launch', 'context', 'assertion', 'page-close', 'context-close', 'browser-close', 'process-shutdown', 'profile-cleanup', 'artifact-cleanup', 'root-cleanup', 'fixture-cleanup', 'runtime']);
const CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY', 'ENOENT', 'EADDRINUSE', 'ECONNREFUSED', 'ETIMEDOUT']);
function safeFailure(error, phase = 'runtime') {
  const message = String(error?.message || '');
  const category = /(?:E2E|Test database) refused: ([A-Z_]{1,80})/.exec(message)?.[1];
  const code = CODES.has(error?.code) ? error.code : [...CODES].find((c) => new RegExp(`\\b${c}\\b`).test(message));
  return { phase: PHASES.has(phase) ? phase : 'runtime', category: category ||
    (code ? `OS_${code}` : /timeout|timed out/i.test(message) ? 'TIMEOUT' : /executable.*(?:not|doesn.t exist)/i.test(message) ? 'EXECUTABLE_UNAVAILABLE' : /Target.*closed|browser.*closed/i.test(message) ? 'BROWSER_CLOSED' : phase === 'launch' ? 'LAUNCH_FAILED' : phase === 'assertion' ? 'ASSERTION_FAILED' : 'OPERATION_FAILED'),
    ...(code ? { code } : {}),
    ...( /\b(to[A-Z][A-Za-z]+)\(/.test(message) ? { assertion: /\b(to[A-Z][A-Za-z]+)\(/.exec(message)[1] } : {}) };
}
function decode(error) {
  const match = /^E2E_FAILURE (\{[^\n]+\})/.exec(error?.message || '');
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    const valid = (r) => r && PHASES.has(r.phase) && /^[A-Z_]{1,80}$/.test(r.category) &&
      Object.keys(r).every((k) => ['phase', 'category', 'code', 'assertion'].includes(k)) &&
      (r.code === undefined || CODES.has(r.code)) && (r.assertion === undefined || /^to[A-Z][A-Za-z]+$/.test(r.assertion));
    return valid(value.primary) && Array.isArray(value.secondary) && value.secondary.every(valid) ? value : null;
  } catch { return null; }
}
function failureState(error, phase) { return decode(error) || { primary: safeFailure(error, phase), secondary: [] }; }
function failureError(state) { return new Error('E2E_FAILURE ' + JSON.stringify(state)); }
async function cleanupStep(state, phase, action) {
  try { await action(); } catch (error) {
    const detail = failureState(error, phase);
    if (!state.primary) { state.primary = detail.primary; state.secondary.push(...detail.secondary); }
    else state.secondary.push(detail.primary, ...detail.secondary);
  }
}
module.exports = { safeFailure, decode, failureState, failureError, cleanupStep };
