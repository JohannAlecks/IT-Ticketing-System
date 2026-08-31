const bcrypt = require('bcrypt');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { signToken } = require('../../utils/jwt');
const { generateSecureToken, hashToken } = require('../../utils/token');
const { sendMail } = require('../../utils/mailer');
const { buildVerificationEmail } = require('../../utils/verificationEmail');
const { recordAudit } = require('../audit/audit.service');
const env = require('../../config/env');

const SALT_ROUNDS = 12;

// Generic message used by BOTH the "created" and "already exists" paths of
// resendVerification, so the response never reveals whether a given email
// is registered (per the anti-enumeration requirement).
const RESEND_GENERIC_MESSAGE =
  'If an eligible account exists, a verification email may be sent when email delivery is available.';

function resendGenericResult() {
  return {
    message: RESEND_GENERIC_MESSAGE,
    retryAfterSeconds: env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  };
}

function deliveryStatus(result) {
  return ['accepted', 'unavailable', 'failed'].includes(result?.status) ? result.status : 'failed';
}

// Database mutations are completed before any provider call. This lets a
// failed or disabled provider leave an unverified account with a usable,
// safely hashed verification token for a later resend.
async function createVerificationToken(tx, user) {
  await tx.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const rawToken = generateSecureToken();
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const record = await tx.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
  });
  return { rawToken, record };
}

async function deliverVerificationEmail(user, issued) {
  try {
    const result = await sendMail({
      ...buildVerificationEmail(user, issued.rawToken),
      idempotencyKey: `verify-email/${issued.record.id}`.slice(0, 256),
    });
    return { status: deliveryStatus(result) };
  } catch {
    return { status: 'failed' };
  }
}

async function issueVerificationToken(user) {
  let issued;
  try {
    issued = await prisma.$transaction(async (tx) => {
      // Lock the account row before checking eligibility/cooldown and rotating.
      // Concurrent resends then serialize across app instances, so a later
      // request cannot invalidate a token after its provider call has begun.
      const eligible = await tx.$queryRaw`
        SELECT id FROM users
        WHERE id = ${user.id} AND "emailVerified" = false AND "isActive" = true
        FOR UPDATE
      `;
      if (eligible.length !== 1) return null;

      const lastToken = await tx.emailVerificationToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lastToken) {
        const cooldownMs = env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;
        if (Date.now() - lastToken.createdAt.getTime() < cooldownMs) return null;
      }
      return createVerificationToken(tx, user);
    });
  } catch (error) {
    // A deadlock/serialization loser must not leak account state or submit a
    // provider request. The caller returns the normal generic response.
    if (error?.code === 'P2034') return null;
    throw error;
  }
  if (!issued) return null;
  return deliverVerificationEmail(user, issued);
}

async function register({ name, email, password }) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const { user, issued } = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) throw new AppError('An account with this email already exists', 409);
    const createdUser = await tx.user.create({
      data: { name, email, password: hashedPassword, role: 'USER', emailVerified: false },
      select: { id: true, name: true, email: true, role: true, department: true, createdAt: true },
    });
    return { user: createdUser, issued: await createVerificationToken(tx, createdUser) };
  });
  const delivery = await deliverVerificationEmail(user, issued);

  // Deliberately NOT returning a JWT here — an unverified account must not
  // be able to reach the application. See login() for the enforcement side.
  return { email: user.email, delivery };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  // Checked AFTER the password match (not before) so this endpoint never
  // reveals verification status for a wrong password — same
  // anti-enumeration principle as the generic "Invalid email or password".
  if (!user.emailVerified) {
    throw new AppError('Please verify your email address before logging in.', 403);
  }

  const token = signToken({ sub: user.id, role: user.role });

  const { password: _password, ...safeUser } = user;
  return { user: safeUser, token };
}

async function verifyEmail(rawToken, requestId) {
  if (!rawToken) throw new AppError('Verification token is required', 400);

  const tokenHash = hashToken(rawToken);
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record) throw new AppError('This verification link is invalid.', 400);

    const user = await tx.user.findUnique({ where: { id: record.userId }, select: { id: true, emailVerified: true } });
    if (!user) throw new AppError('This verification link is invalid.', 400);

    // A browser retry after a successful request is normal. Treat only a
    // consumed token for an already-verified account as idempotent success.
    if (record.usedAt) {
      if (user.emailVerified) return { verified: true, idempotent: true };
      throw new AppError('This verification link is invalid.', 400);
    }
    if (record.expiresAt < new Date()) {
      throw new AppError('This verification link has expired. Please request a new one.', 400);
    }
    if (user.emailVerified) {
      await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      return { verified: true, idempotent: true };
    }

    // Claim the token conditionally so concurrent submissions cannot both
    // produce a state transition or duplicate audit event.
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      const afterRace = await tx.user.findUnique({ where: { id: record.userId }, select: { emailVerified: true } });
      if (afterRace?.emailVerified) return { verified: true, idempotent: true };
      throw new AppError('This verification link is invalid.', 400);
    }

    await tx.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    await tx.auditEvent.create({
      data: {
        eventType: 'auth.email_verified',
        entityType: 'user',
        entityId: record.userId,
        actorUserId: record.userId,
        requestId,
      },
    });
    return { verified: true };
  });
}

async function resendVerification(email, requestId) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, emailVerified: true, isActive: true },
  });

  // Silently no-op for: no such user, already verified, or inactive
  // account — the response is identical either way (see
  // RESEND_GENERIC_MESSAGE) so this can't be used to enumerate accounts.
  if (!user || user.emailVerified || !user.isActive) {
    return resendGenericResult();
  }

  const delivery = await issueVerificationToken(user);
  if (!delivery) return resendGenericResult();
  // This deliberately runs after mail submission and catches its own errors;
  // it only records the safe delivery state, never email, token, content, or URL.
  void recordAudit({
    eventType: 'auth.email_verification_requested',
    entityType: 'user',
    entityId: user.id,
    // The resend route is intentionally unauthenticated; do not attribute
    // the request to the target account merely because its email matched.
    actorUserId: null,
    requestId,
    metadata: { deliveryStatus: delivery.status },
  });
  return resendGenericResult();
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true, department: true, createdAt: true },
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

module.exports = { register, login, verifyEmail, resendVerification, getProfile, createVerificationToken, deliverVerificationEmail };
