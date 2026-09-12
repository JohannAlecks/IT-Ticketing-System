// For direct physical-constraint tests only. Service/API tests assert sanitized
// domain errors instead. Never accept an unrelated driver error as success.
function isNamedCheck(error, name) {
  // Prisma 5's raw-query wrapper drops the trigger's CONSTRAINT field. Match
  // only the verified SQLSTATE plus this applied trigger's exact fixed text.
  if (name === 'user_shortcuts_committed_position' && error?.code === 'P2010' &&
      error.meta?.code === '23514' &&
      error.meta?.message === 'ERROR: Shortcut position must be between 0 and 7 at commit') return true;
  return typeof error?.message === 'string' && error.message.includes(name) &&
    /23514|check constraint/i.test(error.message);
}
async function expectNamedCheck(operation, name) {
  let rejected = false;
  try { await operation; } catch (error) { rejected = isNamedCheck(error, name); }
  expect(rejected).toBe(true);
}
module.exports = { isNamedCheck, expectNamedCheck };
