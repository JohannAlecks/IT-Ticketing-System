const asyncHandler = require('../../utils/asyncHandler');
const commentService = require('./comment.service');
const { recordAudit } = require('../audit/audit.service');

const listComments = asyncHandler(async (req, res) => {
  const comments = await commentService.listComments(req.params.ticketId, req.user);
  res.status(200).json({ success: true, data: { comments } });
});

const addComment = asyncHandler(async (req, res) => {
  const comment = await commentService.addComment(req.params.ticketId, req.body, req.user);
  void recordAudit({ eventType: comment.isInternal ? 'ticket.internal_note_created' : 'ticket.comment_created', entityType: 'comment', entityId: comment.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { ticketId: req.params.ticketId, isInternal: comment.isInternal } });
  res.status(201).json({ success: true, data: { comment } });
});

module.exports = { listComments, addComment };
