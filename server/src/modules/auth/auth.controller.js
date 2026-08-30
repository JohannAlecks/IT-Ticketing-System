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
      message: delivery.delivered
        ? 'Account created. Please check your email to verify your account.'
        : 'Account created. Email verification is required, but delivery is not configured in this environment.',
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
  const result = await authService.resendVerification(req.body.email);
  res.status(200).json({ success: true, data: result });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { register, login, verifyEmail, resendVerification, me };
