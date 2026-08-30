const asyncHandler = require('../../utils/asyncHandler');
const ticketService = require('./ticket.service');
const { recordAudit } = require('../audit/audit.service');

const listTickets = asyncHandler(async (req, res) => {
  const result = await ticketService.listTickets(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getTicketById(req.params.id, req.user);
  res.status(200).json({ success: true, data: { ticket } });
});

const createTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.createTicket(req.body, req.user);
  void recordAudit({ eventType: 'ticket.created', entityType: 'ticket', entityId: ticket.id, actorUserId: req.user.id, requestId: req.requestId });
  res.status(201).json({ success: true, data: { ticket } });
});

const updateTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.updateTicket(req.params.id, req.body, req.user);
  void recordAudit({ eventType: 'ticket.updated', entityType: 'ticket', entityId: ticket.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { changedFields: Object.keys(req.body) } });
  res.status(200).json({ success: true, data: { ticket } });
});

const assignTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.assignTicket(req.params.id, req.body.assignedToId, req.user);
  void recordAudit({ eventType: req.body.assignedToId ? 'ticket.assigned' : 'ticket.unassigned', entityType: 'ticket', entityId: ticket.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { assignedToId: req.body.assignedToId || null } });
  res.status(200).json({ success: true, data: { ticket } });
});

const deleteTicket = asyncHandler(async (req, res) => {
  await ticketService.deleteTicket(req.params.id, { actorUserId: req.user.id, requestId: req.requestId });
  void recordAudit({ eventType: 'ticket.deleted', entityType: 'ticket', entityId: req.params.id, actorUserId: req.user.id, requestId: req.requestId });
  res.status(204).send();
});

module.exports = { listTickets, getTicket, createTicket, updateTicket, assignTicket, deleteTicket };
