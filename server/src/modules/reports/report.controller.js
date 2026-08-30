const asyncHandler = require('../../utils/asyncHandler');
const reportService = require('./report.service');
const { recordAudit } = require('../audit/audit.service');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await reportService.getSummary(req.user, req.query);
  res.status(200).json({ success: true, data: summary });
});

const listTickets = asyncHandler(async (req, res) => {
  const result = await reportService.listTickets(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const exportTickets = asyncHandler(async (req, res) => {
  const result = await reportService.exportTickets(req.user, req.query);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${result.filename}"`,
  });
  res.status(200).send(result.csv);
  void recordAudit({
    eventType: 'report.csv_exported',
    entityType: 'report',
    entityId: 'tickets',
    actorUserId: req.user.id,
    requestId: req.requestId,
    metadata: result.auditMetadata,
  });
});

module.exports = { getSummary, listTickets, exportTickets };
