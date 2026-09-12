const asyncHandler = require('../../utils/asyncHandler');
const attachmentService = require('./attachment.service');
const { recordAudit } = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
// Storage identifiers are operational metadata, not part of the public API.
const publicAttachment = ({ id, ticketId, uploadedById, originalFileName, mimeType, fileSize, createdAt, uploadedBy }) =>
  ({ id, ticketId, uploadedById, originalFileName, mimeType, fileSize, createdAt, uploadedBy });

const listAttachments = asyncHandler(async (req, res) => {
  const attachments = await attachmentService.listAttachments(req.params.ticketId, req.user);
  res.status(200).json({ success: true, data: { attachments: attachments.map(publicAttachment) } });
});

const uploadAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.uploadAttachment(req.params.ticketId, req.file, req.user);
  void recordAudit({ eventType: 'attachment.uploaded', entityType: 'attachment', entityId: attachment.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { ticketId: req.params.ticketId, mimeType: attachment.mimeType, fileSize: attachment.fileSize } });
  res.status(201).json({ success: true, data: { attachment: publicAttachment(attachment) } });
});

const downloadAttachment = asyncHandler(async (req, res, next) => {
  const { attachment, absolutePath } = await attachmentService.getAttachmentForDownload(
    req.params.ticketId,
    req.params.attachmentId,
    req.user
  );
  // res.download sets Content-Disposition using the ORIGINAL filename (safe
  // to expose to the client), while reading from the random on-disk name.
  res.download(absolutePath, attachment.originalFileName, (error) => {
    if (!error) return;
    if (res.headersSent) { res.destroy(); return; }
    next(new AppError('Attachment download could not be completed', error.code === 'ENOENT' ? 404 : 503));
  });
});

const deleteAttachment = asyncHandler(async (req, res) => {
  await attachmentService.deleteAttachment(req.params.ticketId, req.params.attachmentId, req.user);
  void recordAudit({ eventType: 'attachment.deleted', entityType: 'attachment', entityId: req.params.attachmentId, actorUserId: req.user.id, requestId: req.requestId, metadata: { ticketId: req.params.ticketId } });
  res.status(204).send();
});

module.exports = { listAttachments, uploadAttachment, downloadAttachment, deleteAttachment };
