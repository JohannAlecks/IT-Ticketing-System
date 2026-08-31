const express = require('express');
const router = express.Router();

const authController = require('./auth.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const createRateLimit = require('../../middleware/rateLimit');
const env = require('../../config/env');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require('./auth.schema');

const authRateLimit = createRateLimit({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, max: env.AUTH_RATE_LIMIT_MAX });
const resendIdentityRateLimit = createRateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => `resend-verification:${req.body.email}`,
});
router.post('/register', authRateLimit, validate(registerSchema), authController.register);
router.post('/login', authRateLimit, validate(loginSchema), authController.login);
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-verification', authRateLimit, validate(resendVerificationSchema), resendIdentityRateLimit, authController.resendVerification);
router.get('/me', authenticate, authController.me);

module.exports = router;
