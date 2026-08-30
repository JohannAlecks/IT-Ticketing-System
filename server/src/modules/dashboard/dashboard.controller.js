const asyncHandler = require('../../utils/asyncHandler');
const dashboardService = require('./dashboard.service');

const getStats = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getStats(req.user);
  res.status(200).json({ success: true, data: stats });
});

const getAgentWorkload = asyncHandler(async (req, res) => {
  const workload = await dashboardService.getAgentWorkload();
  res.status(200).json({ success: true, data: { workload } });
});

const getSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getSummary(req.user);
  res.status(200).json({ success: true, data: summary });
});

module.exports = { getStats, getAgentWorkload, getSummary };
