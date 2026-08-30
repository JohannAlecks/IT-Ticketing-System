const asyncHandler = require('../../utils/asyncHandler');
const attachmentService = require('./attachment.service');
const { recordAudit } = require('../audit/audit.service');

const listAttachments = asyncHandler(async (req, res) => {
  const attachments = await attachmentService.listAttachments(req.params.ticketId, req.user);
  res.status(200).json({ success: true, data: { attachments } });
});

const uploadAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.uploadAttachment(req.params.ticketId, req.file, req.user);
  void recordAudit({ eventType: 'attachment.uploaded', entityType: 'attachment', entityId: attachment.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { ticketId: req.params.ticketId, mimeType: attachment.mimeType, fileSize: attachment.fileSize } });
  res.status(201).json({ success: true, data: { attachment } });
});

const downloadAttachment = asyncHandler(async (req, res) => {
  const { attachment, absolutePath } = await attachmentService.getAttachmentForDownload(
    req.params.ticketId,
    req.params.attachmentId,
    req.user
  );
  // res.download sets Content-Disposition using the ORIGINAL filename (safe
  // to expose to the client), while reading from the random on-disk name.
  res.download(absolutePath, attachment.originalFileName);
});

const deleteAttachment = asyncHandler(async (req, res) => {
  await attachmentService.deleteAttachment(req.params.ticketId, req.params.attachmentId, req.user);
  void recordAudit({ eventType: 'attachment.deleted', entityType: 'attachment', entityId: req.params.attachmentId, actorUserId: req.user.id, requestId: req.requestId, metadata: { ticketId: req.params.ticketId } });
  res.status(204).send();
});

module.exports = { listAttachments, uploadAttachment, downloadAttachment, deleteAttachment };
