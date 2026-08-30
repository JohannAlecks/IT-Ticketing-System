const asyncHandler = require('../../utils/asyncHandler');
const service = require('./onboarding.service');
exports.getMine = asyncHandler(async (req, res) => res.json({ success: true, data: { onboarding: await service.getOnboarding(req.user.id) } }));
exports.updateMine = asyncHandler(async (req, res) => res.json({ success: true, data: { onboarding: await service.updateOnboarding(req.user.id, req.body) } }));
