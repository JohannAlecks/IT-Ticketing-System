const express = require('express');
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const validateUuidParam = require('../../middleware/validateUuidParam');
const controller = require('./notification.controller');
const { listQuerySchema, emptyBodySchema } = require('./notification.schema');

const router = express.Router();
router.use(authenticate);
router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', validate(emptyBodySchema), controller.readAll);
router.patch('/:id/read', validateUuidParam('id'), validate(emptyBodySchema), controller.markRead);
router.patch('/:id/unread', validateUuidParam('id'), validate(emptyBodySchema), controller.markUnread);
module.exports = router;
