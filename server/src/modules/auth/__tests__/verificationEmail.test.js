describe('verification email template', () => {
  afterEach(() => {
    jest.dontMock('../../../config/env');
    jest.resetModules();
  });

  test('escapes user and app text and uses a URL-built verification link', () => {
    jest.doMock('../../../config/env', () => ({
      CLIENT_URL: 'https://app.example.test/helpdesk', EMAIL_APP_NAME: '<Help&Desk>', EMAIL_SUPPORT: 'support@example.test', EMAIL_VERIFICATION_TOKEN_TTL_HOURS: 24,
    }));
    const { buildVerificationEmail } = require('../../../utils/verificationEmail');
    const email = buildVerificationEmail({ name: '<Uma & User>', email: 'uma@example.test' }, 'raw token&value');
    expect(email.html).toContain('Hi &lt;Uma &amp; User&gt;');
    expect(email.html).toContain('&lt;Help&amp;Desk&gt;');
    expect(email.html).not.toContain('Hi <Uma & User>');
    expect(email.html).toContain('https://app.example.test/helpdesk/verify-email?token=raw+token%26value');
    expect(email.text).toContain('https://app.example.test/helpdesk/verify-email?token=raw+token%26value');
  });
});
