const express = require('express');
// mergeParams lets this router read :ticketId from the parent ticket.routes.js
const router = express.Router({ mergeParams: true });

const attachmentController = require('./attachment.controller');
const { uploadSingleFile } = require('../../middleware/upload');
const validateUuidParam = require('../../middleware/validateUuidParam');

// authenticate is already applied by the parent ticket.routes.js, and
// :ticketId is already validated there. Authorization (who can see/upload/
// delete for THIS ticket) happens inside attachment.service.js, not here —
// same pattern as comment.routes.js.
router.get('/', attachmentController.listAttachments);
router.post('/', uploadSingleFile('file'), attachmentController.uploadAttachment);
router.get('/:attachmentId/download', validateUuidParam('attachmentId'), attachmentController.downloadAttachment);
router.delete('/:attachmentId', validateUuidParam('attachmentId'), attachmentController.deleteAttachment);

module.exports = router;
