const crypto = require('crypto');

// 32 random bytes = 256 bits of entropy, hex-encoded (64 chars) — this is
// the raw token that goes in the email link. It is NEVER stored as-is.
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

// SHA-256 is appropriate here (unlike password hashing, this isn't a
// low-entropy secret an attacker could brute-force offline — it's already
// a 256-bit random value, so a fast hash is fine and lets us look it up by
// exact match instead of needing bcrypt.compare against every row).
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = { generateSecureToken, hashToken };
