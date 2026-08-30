const originalEnv = { ...process.env };

afterEach(() => {
  jest.dontMock('../../../config/env');
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

describe('mailer safety', () => {
  test('development without a provider is explicit and never logs verification tokens or URLs', async () => {
    jest.doMock('../../../config/env', () => ({ EMAIL_PROVIDER: null }));
    const { sendMail } = require('../../../utils/mailer');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rawToken = 'verification-token-that-must-not-be-logged';
    const url = `https://example.test/verify-email?token=${rawToken}`;

    await expect(sendMail({ to: 'person@example.test', subject: 'Verify', text: url })).resolves.toEqual({
      delivered: false,
      attempted: false,
      reason: 'no_provider_configured',
    });

    const logged = warning.mock.calls.flat().join(' ');
    expect(logged).not.toContain(rawToken);
    expect(logged).not.toContain(url);
    expect(logged).not.toContain('person@example.test');
  });

  test('a configured-but-unsupported provider is gated and does not expose message contents', async () => {
    jest.doMock('../../../config/env', () => ({ EMAIL_PROVIDER: 'unsupported-provider' }));
    const { sendMail } = require('../../../utils/mailer');
    const rawToken = 'verification-token-that-must-not-be-logged';

    await expect(sendMail({ to: 'person@example.test', subject: 'Verify', text: rawToken }))
      .rejects.toThrow('configured but unsupported');
  });
});

describe('production environment guard', () => {
  test('blocks production startup when no implemented verification provider is available', () => {
    jest.dontMock('../../../config/env');
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/ticketing_test';
    process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
    process.env.EMAIL_PROVIDER = '';

    expect(() => require('../../../config/env')).toThrow('Production startup blocked');
  });

  test('blocks production startup even when an unimplemented provider is configured', () => {
    jest.dontMock('../../../config/env');
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/ticketing_test';
    process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
    process.env.EMAIL_PROVIDER = 'unsupported-provider';

    expect(() => require('../../../config/env')).toThrow('no production email provider is implemented');
  });
});
