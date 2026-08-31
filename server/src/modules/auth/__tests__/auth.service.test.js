jest.mock('../../../config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  emailVerificationToken: {
    deleteMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditEvent: { create: jest.fn() },
  $queryRaw: jest.fn(async () => [{ id: 'user-1' }]),
  $transaction: jest.fn(async (callback) => callback(mockPrisma)),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(async () => 'hashed-password'),
  compare: jest.fn(async (plain, hash) => plain === 'correct-password' && hash === 'hashed-password'),
}));

jest.mock('../../../utils/jwt', () => ({
  signToken: jest.fn(() => 'fake-jwt-token'),
}));

jest.mock('../../../utils/mailer', () => ({
  sendMail: jest.fn(async () => ({ status: 'unavailable' })),
}));

jest.mock('../../audit/audit.service', () => ({ recordAudit: jest.fn() }));

const mockPrisma = require('../../../config/prisma');
const { sendMail } = require('../../../utils/mailer');
const { hashToken, generateSecureToken } = require('../../../utils/token');
const { recordAudit } = require('../../audit/audit.service');
const authService = require('../auth.service');

const baseUser = (overrides = {}) => ({
  id: 'user-1',
  name: 'Uma User',
  email: 'uma@example.com',
  password: 'hashed-password',
  role: 'USER',
  isActive: true,
  emailVerified: false,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('register', () => {
  test('creates an account with emailVerified: false', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // no existing account
    mockPrisma.user.create.mockResolvedValue(baseUser());
    mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'tok-1' });

    await authService.register({ name: 'Uma User', email: 'uma@example.com', password: 'correct-password' });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailVerified: false }) })
    );
  });

  test('sends a verification email and does NOT return a JWT', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(baseUser());
    mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'tok-1' });

    const result = await authService.register({ name: 'Uma User', email: 'uma@example.com', password: 'correct-password' });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('uma@example.com');
    expect(sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({ html: expect.any(String), text: expect.any(String), idempotencyKey: 'verify-email/tok-1' }));
    expect(result).not.toHaveProperty('token');
  });

  test.each(['accepted', 'unavailable', 'failed'])('keeps account and hashed token when delivery is %s', async (status) => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(baseUser());
    mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'tok-1' });
    sendMail.mockResolvedValueOnce({ status });

    await expect(authService.register({ name: 'Uma User', email: 'uma@example.com', password: 'correct-password' }))
      .resolves.toEqual({ email: 'uma@example.com', delivery: { status } });
    expect(mockPrisma.user.create).toHaveBeenCalled();
    expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokenHash: expect.any(String) }),
    }));
  });

  test('rejects registration for an already-existing email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    await expect(
      authService.register({ name: 'Uma User', email: 'uma@example.com', password: 'correct-password' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('login — unverified account blocked', () => {
  test('an unverified user cannot log in even with correct credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    await expect(
      authService.login({ email: 'uma@example.com', password: 'correct-password' })
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('verify your email') });
  });

  test('a verified user CAN log in with correct credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: true }));
    const result = await authService.login({ email: 'uma@example.com', password: 'correct-password' });
    expect(result.token).toBe('fake-jwt-token');
    expect(result.user.email).toBe('uma@example.com');
  });

  test('wrong password is rejected before verification status is even considered', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    await expect(
      authService.login({ email: 'uma@example.com', password: 'wrong-password' })
    ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid email or password' });
  });

  test('deactivated account is rejected regardless of verification status', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: true, isActive: false }));
    await expect(
      authService.login({ email: 'uma@example.com', password: 'correct-password' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('an account can log in with the same valid credentials after reactivation', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(baseUser({ emailVerified: true, isActive: false }));
    await expect(authService.login({ email: 'uma@example.com', password: 'correct-password' })).rejects.toMatchObject({ statusCode: 401 });
    mockPrisma.user.findUnique.mockResolvedValueOnce(baseUser({ emailVerified: true, isActive: true }));
    await expect(authService.login({ email: 'uma@example.com', password: 'correct-password' })).resolves.toMatchObject({ token: 'fake-jwt-token' });
  });
});

describe('verifyEmail', () => {
  test('a valid, unused, unexpired token verifies the account', async () => {
    const rawToken = generateSecureToken();
    const record = {
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000), // 1 minute in the future
    };
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(record);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailVerified: false });
    mockPrisma.user.update.mockResolvedValue(baseUser({ emailVerified: true }));
    mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(authService.verifyEmail(rawToken)).resolves.toEqual({ verified: true });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { emailVerified: true } })
    );
  });

  test('an expired token is rejected', async () => {
    const rawToken = generateSecureToken();
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailVerified: false });

    await expect(authService.verifyEmail(rawToken)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('expired'),
    });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  test('a token that does not match any record is rejected', async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(authService.verifyEmail('totally-made-up-token')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('a used token is idempotently accepted when its user is already verified', async () => {
    const rawToken = generateSecureToken();
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      usedAt: new Date(), // already used
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailVerified: true });

    await expect(authService.verifyEmail(rawToken)).resolves.toEqual({ verified: true, idempotent: true });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  test('a used token for an unverified user is rejected as invalid', async () => {
    const rawToken = generateSecureToken();
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1', userId: 'user-1', tokenHash: hashToken(rawToken), usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailVerified: false });

    await expect(authService.verifyEmail(rawToken)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('invalid') });
  });

  test('a concurrent claim that loses the race is idempotently successful when verification completed', async () => {
    const rawToken = generateSecureToken();
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1', userId: 'user-1', tokenHash: hashToken(rawToken), usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1', emailVerified: false })
      .mockResolvedValueOnce({ id: 'user-1', emailVerified: true });
    mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(authService.verifyEmail(rawToken)).resolves.toEqual({ verified: true, idempotent: true });
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe('resendVerification', () => {
  test('creates a fresh token and sends a new email for an unverified account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null); // no prior token, no cooldown
    mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'tok-2' });

    const result = await authService.resendVerification('uma@example.com');

    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      message: expect.stringMatching(/may be sent when email delivery is available/i),
      retryAfterSeconds: expect.any(Number),
    }));
  });

  test('returns the same generic message for a non-existent email (no enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await authService.resendVerification('nobody@example.com');
    expect(sendMail).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      message: expect.stringMatching(/if an eligible account exists/i),
      retryAfterSeconds: expect.any(Number),
    }));
  });

  test('returns the same generic message for an already-verified email (no enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: true }));
    const result = await authService.resendVerification('uma@example.com');
    expect(sendMail).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      message: expect.stringMatching(/if an eligible account exists/i),
      retryAfterSeconds: expect.any(Number),
    }));
  });

  test('returns the exact generic message within the cooldown window', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 'tok-recent',
      createdAt: new Date(), // just created — well within any cooldown
    });

    const result = await authService.resendVerification('uma@example.com');
    expect(result).toEqual({
      message: 'If an eligible account exists, a verification email may be sent when email delivery is available.',
      retryAfterSeconds: expect.any(Number),
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('rechecks eligibility under the account lock before rotating or sending', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(authService.resendVerification('uma@example.com')).resolves.toEqual({
      message: 'If an eligible account exists, a verification email may be sent when email delivery is available.',
      retryAfterSeconds: expect.any(Number),
    });
    expect(mockPrisma.emailVerificationToken.findFirst).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('audits only the safe delivery state without attributing the public request', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null);
    mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'tok-2' });
    sendMail.mockResolvedValueOnce({ status: 'accepted' });

    await authService.resendVerification('uma@example.com', 'request-1');

    expect(recordAudit).toHaveBeenCalledWith({
      eventType: 'auth.email_verification_requested',
      entityType: 'user',
      entityId: 'user-1',
      actorUserId: null,
      requestId: 'request-1',
      metadata: { deliveryStatus: 'accepted' },
    });
  });
});
