const express = require('express');
// mergeParams lets this router read :ticketId from the parent ticket.routes.js
const router = express.Router({ mergeParams: true });

const commentController = require('./comment.controller');
const validate = require('../../middleware/validate');
const { createCommentSchema } = require('./comment.schema');

// authenticate is already applied by the parent ticket.routes.js
router.get('/', commentController.listComments);
router.post('/', validate(createCommentSchema), commentController.addComment);

module.exports = router;
