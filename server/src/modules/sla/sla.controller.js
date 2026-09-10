const asyncHandler = require('../../utils/asyncHandler');
const service = require('./sla.service');

const listPolicies = asyncHandler(async (_req, res) => res.status(200).json({ success: true, data: await service.listPolicies() }));
const updatePolicy = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: { policy: await service.updatePolicy(req.params.id, req.body, req.user, req.requestId) } }));

module.exports = { listPolicies, updatePolicy };
