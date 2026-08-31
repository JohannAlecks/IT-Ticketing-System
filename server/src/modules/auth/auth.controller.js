const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');
const { recordAudit } = require('../audit/audit.service');

const register = asyncHandler(async (req, res) => {
  const { email, delivery } = await authService.register(req.body);
  // No token issued — registration no longer authenticates the user.
  res.status(201).json({
    success: true,
    data: {
      email,
      delivery: { status: delivery.status },
      message: delivery.status === 'accepted'
        ? 'Account created. Your verification email request was accepted by the email service; please check your inbox.'
        : delivery.status === 'unavailable'
          ? 'Account created. Email verification is required, but delivery is disabled in this environment.'
          : 'Account created. The verification email request failed; you may use resend verification later.',
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  void recordAudit({ eventType: 'auth.login_succeeded', entityType: 'user', entityId: user.id, actorUserId: user.id, requestId: req.requestId });
  res.status(200).json({ success: true, data: { user, token } });
});

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token, req.requestId);
  res.status(200).json({ success: true, data: { message: 'Email verified successfully. You can now log in.' } });
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body.email, req.requestId);
  res.status(200).json({ success: true, data: result });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { register, login, verifyEmail, resendVerification, me };
