const express = require('express');
const router = express.Router();

const ticketController = require('./ticket.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const validateUuidParam = require('../../middleware/validateUuidParam');
const {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  archiveActionSchema,
  listQuerySchema,
} = require('./ticket.schema');

// Nested comment routes (mounted here so /tickets/:ticketId/comments works)
const commentRoutes = require('../comments/comment.routes');
// Nested attachment routes (mounted here so /tickets/:ticketId/attachments works)
const attachmentRoutes = require('../attachments/attachment.routes');

router.use(authenticate); // every ticket route requires auth

router.get('/', validate(listQuerySchema, 'query'), ticketController.listTickets);
router.get('/:id', validateUuidParam('id'), ticketController.getTicket);

router.post('/', validate(createTicketSchema), ticketController.createTicket);
router.patch('/:id', validateUuidParam('id'), validate(updateTicketSchema), ticketController.updateTicket);

router.patch('/:id/archive', validateUuidParam('id'), validate(archiveActionSchema), ticketController.archiveTicket);
router.patch('/:id/restore', validateUuidParam('id'), validate(archiveActionSchema), ticketController.restoreTicket);

// Only Agents/Admins assign tickets
router.patch(
  '/:id/assign',
  validateUuidParam('id'),
  authorize('AGENT', 'ADMIN'),
  validate(assignTicketSchema),
  ticketController.assignTicket
);

// Only Admins can hard-delete a ticket
router.delete('/:id', validateUuidParam('id'), authorize('ADMIN'), ticketController.deleteTicket);

router.use('/:ticketId/comments', validateUuidParam('ticketId'), commentRoutes);
router.use('/:ticketId/attachments', validateUuidParam('ticketId'), attachmentRoutes);

module.exports = router;
