const asyncHandler = require('../../utils/asyncHandler');
const settings = require('./settings.service');
const { recordAudit } = require('../audit/audit.service');

const me = asyncHandler(async (req, res) => res.json({ success: true, data: { user: await settings.getMySettings(req.user.id) } }));
const updateProfile = asyncHandler(async (req, res) => { const user = await settings.updateMyProfile(req.user.id, req.body); void recordAudit({ eventType: 'user.profile_updated', entityType: 'user', entityId: user.id, actorUserId: user.id, requestId: req.requestId, metadata: { changedFields: Object.keys(req.body) } }); res.json({ success: true, data: { user } }); });
const changePassword = asyncHandler(async (req, res) => { await settings.changeMyPassword(req.user.id, req.body); void recordAudit({ eventType: 'user.password_changed', entityType: 'user', entityId: req.user.id, actorUserId: req.user.id, requestId: req.requestId }); res.status(204).send(); });
const systemInfo = asyncHandler(async (req, res) => res.json({ success: true, data: settings.getSystemInfo() }));
module.exports = { me, updateProfile, changePassword, systemInfo };
