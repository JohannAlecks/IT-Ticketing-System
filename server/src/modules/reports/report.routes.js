const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { reportQuerySchema, ticketQuerySchema, exportQuerySchema } = require('./report.schema');
const controller = require('./report.controller');

const router = express.Router();

router.use(authenticate, authorize('AGENT', 'ADMIN'));
router.get('/summary', validate(reportQuerySchema, 'query'), controller.getSummary);
router.get('/tickets/export', validate(exportQuerySchema, 'query'), controller.exportTickets);
router.get('/tickets', validate(ticketQuerySchema, 'query'), controller.listTickets);

module.exports = router;
