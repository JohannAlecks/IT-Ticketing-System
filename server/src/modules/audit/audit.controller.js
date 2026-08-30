const asyncHandler = require('../../utils/asyncHandler');
const { listAuditEvents } = require('./audit.service');

const getAuditEvents = asyncHandler(async (req, res) => {
  const result = await listAuditEvents(req.query);
  res.status(200).json({ success: true, data: result });
});

module.exports = { getAuditEvents };
