const express = require('express');
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const validateUuidParam = require('../../middleware/validateUuidParam');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./satisfaction.service');
const { report } = require('./satisfaction.reports');
const { feedbackSchema, pageSchema } = require('./satisfaction.schema');
const ticketRouter = express.Router({ mergeParams: true });
const noStore = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
ticketRouter.use(noStore);
ticketRouter.use(validateUuidParam('ticketId'));
ticketRouter.get('/', validate(pageSchema, 'query'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getTicketSatisfaction(req.params.ticketId, req.user, req.query) });
}));
for (const method of ['post', 'patch']) ticketRouter[method]('/', validate(feedbackSchema), asyncHandler(async (req, res) => {
  const data = await service.saveFeedback(req.params.ticketId, req.body, req.user, req.get('If-Match'), method === 'patch', req.requestId);
  res.status(method === 'post' ? 201 : 200).json({ success: true, data });
}));
const router = express.Router();
router.use(authenticate);
router.use(noStore);
router.get('/me', validate(pageSchema, 'query'), asyncHandler(async (req, res) => res.json({ success: true, data: await service.listMine(req.user, req.query) })));
router.get('/summary', asyncHandler(async (req, res) => res.json({ success: true, data: await report(req.user, {}, true) })));
module.exports = { ticketRouter, router };
