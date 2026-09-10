const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const validateUuidParam = require('../../middleware/validateUuidParam');
const controller = require('./sla.controller');
const { policyPatchSchema } = require('./sla.schema');

const router = express.Router();
router.use(authenticate, authorize('ADMIN'));
router.get('/policies', controller.listPolicies);
router.patch('/policies/:id', validateUuidParam('id'), validate(policyPatchSchema), controller.updatePolicy);
module.exports = router;
