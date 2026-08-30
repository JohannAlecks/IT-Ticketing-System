const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const controller = require('./onboarding.controller');
const { updateOnboardingSchema } = require('./onboarding.schema');
router.use(authenticate);
router.get('/me', controller.getMine);
router.patch('/me', validate(updateOnboardingSchema), controller.updateMine);
module.exports = router;
