const express = require('express');
const router = express.Router();

const userController = require('./user.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { createUserSchema, updateRoleSchema, setActiveSchema, emptyBodySchema, listUsersQuerySchema } = require('./user.schema');
const validateUuidParam = require('../../middleware/validateUuidParam');

router.use(authenticate);

// Staff use this list for queue filters and assignment controls. Plain users
// do not need organization account data to submit or track their tickets.
router.get('/agents', authorize('AGENT', 'ADMIN'), userController.listAgents);

// Admin-only user management
router.get('/', authorize('ADMIN'), validate(listUsersQuerySchema, 'query'), userController.listUsers);
router.get('/:id', authorize('ADMIN'), userController.getUser);
router.post('/', authorize('ADMIN'), validate(createUserSchema), userController.createUser);
router.patch('/:id/role', authorize('ADMIN'), validateUuidParam('id'), validate(updateRoleSchema), userController.updateUserRole);
router.patch('/:id/status', authorize('ADMIN'), validateUuidParam('id'), validate(setActiveSchema), userController.setUserActive);
router.patch('/:id/deactivate', authorize('ADMIN'), validateUuidParam('id'), validate(emptyBodySchema), userController.deactivateUser);
router.patch('/:id/reactivate', authorize('ADMIN'), validateUuidParam('id'), validate(emptyBodySchema), userController.reactivateUser);

module.exports = router;
