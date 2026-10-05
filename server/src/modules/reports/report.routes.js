const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { reportQuerySchema, ticketQuerySchema, exportQuerySchema } = require('./report.schema');
const controller = require('./report.controller');

const router = express.Router();

router.use(authenticate, authorize('AGENT', 'ADMIN'));
const env = require('../../config/env');
router.use(require('../../middleware/rateLimit')({ windowMs: env.REPORT_RATE_LIMIT_WINDOW_MS, max: env.REPORT_RATE_LIMIT_MAX, keyGenerator: (req) => req.user.id }));
router.get('/satisfaction', validate(require('../satisfaction/satisfaction.schema').csatReportSchema, 'query'), require('../../utils/asyncHandler')(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await require('../satisfaction/satisfaction.reports').report(req.user, req.query) });
}));
router.get('/summary', validate(reportQuerySchema, 'query'), controller.getSummary);
router.get('/tickets/export', validate(exportQuerySchema, 'query'), controller.exportTickets);
router.get('/tickets', validate(ticketQuerySchema, 'query'), controller.listTickets);

module.exports = router;
