const originalEnv = { ...process.env };

afterEach(() => {
  jest.dontMock('../../../config/env');
  jest.dontMock('resend');
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

describe('mailer provider facade', () => {
  function loadMailer(env, send) {
    const client = { emails: { send }, logError: jest.fn() };
    const Resend = jest.fn(() => client);
    jest.doMock('../../../config/env', () => env);
    jest.doMock('resend', () => ({ Resend }));
    return { ...require('../../../utils/mailer'), Resend, client };
  }

  test('disabled delivery is explicit and does not instantiate a provider', async () => {
    const { sendMail, Resend } = loadMailer({ EMAIL_PROVIDER: 'disabled' }, jest.fn());
    await expect(sendMail({ to: 'person@example.test', subject: 'Verify', text: 'private' })).resolves.toEqual({ status: 'unavailable' });
    expect(Resend).not.toHaveBeenCalled();
  });

  test('resend returns only accepted status and pins safe SDK request options', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email-id-1' } });
    const { sendMail, Resend } = loadMailer({
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', EMAIL_FROM: 'from@example.test', EMAIL_REPLY_TO: 'reply@example.test', EMAIL_DELIVERY_TIMEOUT_MS: 10000,
    }, send);
    await expect(sendMail({ to: 'person@example.test', subject: 'Verify', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'verify-email/row-1' }))
      .resolves.toEqual({ status: 'accepted' });
    expect(Resend).toHaveBeenCalledWith('test-key', { baseUrl: 'https://api.resend.com' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'from@example.test', to: 'person@example.test', replyTo: 'reply@example.test', html: '<p>Hi</p>', text: 'Hi' }),
      expect.objectContaining({ idempotencyKey: 'verify-email/row-1', signal: expect.any(AbortSignal) }),
    );
  });

  test.each([
    ['provider error', jest.fn().mockResolvedValue({ error: { message: 'private provider detail' } })],
    ['provider throw', jest.fn().mockRejectedValue(new Error('private provider detail'))],
  ])('resend maps %s to safe failed status', async (_name, send) => {
    const { sendMail } = loadMailer({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', EMAIL_FROM: 'from@example.test', EMAIL_DELIVERY_TIMEOUT_MS: 10000 }, send);
    await expect(sendMail({ to: 'person@example.test', subject: 'Verify', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'verify-email/row-1' })).resolves.toEqual({ status: 'failed' });
  });

  test('resend timeout maps to safe failed status', async () => {
    jest.useFakeTimers();
    let signal;
    const send = jest.fn((_payload, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const { sendMail } = loadMailer({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', EMAIL_FROM: 'from@example.test', EMAIL_DELIVERY_TIMEOUT_MS: 10 }, send);
    const result = sendMail({ to: 'person@example.test', subject: 'Verify', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'verify-email/row-1' });
    await jest.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ status: 'failed' });
    expect(signal.aborted).toBe(true);
    jest.useRealTimers();
  });

  test('suppresses the SDK provider-detail logger', async () => {
    const send = jest.fn().mockResolvedValue({ error: { message: 'private provider detail' } });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sendMail, client } = loadMailer({
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', EMAIL_FROM: 'from@example.test', EMAIL_DELIVERY_TIMEOUT_MS: 10000,
    }, send);

    await sendMail({ to: 'person@example.test', subject: 'Verify', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'verify-email/row-1' });
    client.logError({ message: 'private provider detail' });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('environment validation', () => {
  function requireEnv(overrides) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/ticketing_test',
      JWT_SECRET: 'test-jwt-secret',
      NODE_ENV: 'development',
      EMAIL_PROVIDER: 'disabled',
      ...overrides,
    };
    return () => require('../../../config/env');
  }

  test('development defaults safely to disabled and exports mail configuration', () => {
    const env = requireEnv({ EMAIL_PROVIDER: undefined });
    expect(env().EMAIL_PROVIDER).toBe('disabled');
    expect(env().EMAIL_APP_NAME).toBe('HelpDesk');
    expect(env().EMAIL_DELIVERY_TIMEOUT_MS).toBe(10000);
  });

  test('rejects an unknown provider and missing resend settings', () => {
    expect(requireEnv({ EMAIL_PROVIDER: 'smtp' })).toThrow('EMAIL_PROVIDER must be exactly disabled or resend');
    expect(requireEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '', EMAIL_FROM: '' })).toThrow('EMAIL_FROM');
  });

  test('production requires resend, credentials, and trusted HTTPS client URL', () => {
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'disabled' })).toThrow('Production requires EMAIL_PROVIDER=resend');
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key', EMAIL_FROM: 'from@example.test', CLIENT_URL: 'http://localhost:5173' })).toThrow('trusted HTTPS');
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key', EMAIL_FROM: 'from@example.test', CLIENT_URL: 'https://localhost.' })).toThrow('non-localhost');
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key', EMAIL_FROM: 'from@example.test', CLIENT_URL: 'https://10.0.0.4' })).toThrow('non-private');
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key', EMAIL_FROM: 'from@example.test', CLIENT_URL: 'https://ticketing.internal' })).toThrow('non-private');
    expect(requireEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'RESEND', RESEND_API_KEY: 'key', EMAIL_FROM: 'HelpDesk <from@example.test>', CLIENT_URL: 'https://app.example.test' })()).toEqual(expect.objectContaining({
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM: 'HelpDesk <from@example.test>',
    }));
  });

  test('rejects unsafe client URLs and invalid optional mailboxes', () => {
    expect(requireEnv({ CLIENT_URL: 'https://user:pass@example.test' })).toThrow('without credentials');
    expect(requireEnv({ EMAIL_REPLY_TO: 'not-an-email' })).toThrow('EMAIL_REPLY_TO');
    expect(requireEnv({ EMAIL_SUPPORT: 'not-an-email' })).toThrow('EMAIL_SUPPORT');
    expect(requireEnv({ EMAIL_REPLY_TO: 'person@example.test,attacker@example.test' })).toThrow('EMAIL_REPLY_TO');
    expect(requireEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key', EMAIL_FROM: 'HelpDesk <invalid>' })).toThrow('EMAIL_FROM');
    expect(requireEnv({ EMAIL_APP_NAME: 'HelpDesk\r\nBcc: attacker@example.test' })).toThrow('EMAIL_APP_NAME');
    expect(requireEnv({ EMAIL_DELIVERY_TIMEOUT_MS: '0' })).toThrow('EMAIL_DELIVERY_TIMEOUT_MS');
  });
});
