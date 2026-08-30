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
  sendMail: jest.fn(async () => ({ delivered: false, reason: 'no_provider_configured' })),
}));

const mockPrisma = require('../../../config/prisma');
const { sendMail } = require('../../../utils/mailer');
const { hashToken, generateSecureToken } = require('../../../utils/token');
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
    expect(result).not.toHaveProperty('token');
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
    expect(result.message).toMatch(/may be sent when email delivery is available/i);
  });

  test('returns the same generic message for a non-existent email (no enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await authService.resendVerification('nobody@example.com');
    expect(sendMail).not.toHaveBeenCalled();
    expect(result.message).toMatch(/if an eligible account exists/i);
  });

  test('returns the same generic message for an already-verified email (no enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: true }));
    const result = await authService.resendVerification('uma@example.com');
    expect(sendMail).not.toHaveBeenCalled();
    expect(result.message).toMatch(/if an eligible account exists/i);
  });

  test('rejects a resend within the cooldown window', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ emailVerified: false }));
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 'tok-recent',
      createdAt: new Date(), // just created — well within any cooldown
    });

    await expect(authService.resendVerification('uma@example.com')).rejects.toMatchObject({ statusCode: 429 });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
