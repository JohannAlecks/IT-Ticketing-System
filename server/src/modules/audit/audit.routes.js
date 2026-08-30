const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { getAuditEvents } = require('./audit.controller');

const router = express.Router();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  eventType: z.string().trim().max(80).optional(),
}).strict();

router.use(authenticate, authorize('ADMIN'));
router.get('/', validate(querySchema, 'query'), getAuditEvents);

module.exports = router;
