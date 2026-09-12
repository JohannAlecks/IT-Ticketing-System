const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const service = require('./emailLog.service');
router.use(authenticate, authorize('ADMIN'));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await service.list(req.user, req.query) })));
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await service.detail(req.user, req.params.id) })));
// No resend, webhook, deletion, export, or user-facing write endpoint.
router.use((error, req, res, next) => {
  if (error instanceof require('jsonwebtoken').JsonWebTokenError) return next(new AppError('Authentication required', 401));
  return next(error instanceof AppError ? error : new AppError('Email logs unavailable', 503));
});
module.exports = router;
