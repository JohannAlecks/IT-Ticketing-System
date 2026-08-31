const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const validateUuidParam = require('../../middleware/validateUuidParam');
const controller = require('./knowledge.controller');
const schemas = require('./knowledge.schema');

const router = express.Router();

router.use(authenticate);

// Static routes are intentionally registered before the public slug route.
router.get('/', validate(schemas.listQuerySchema, 'query'), controller.listArticles);
router.get('/suggestions', validate(schemas.suggestionQuerySchema, 'query'), controller.listSuggestions);
router.get('/manage/:id', validateUuidParam('id'), controller.getManagementArticle);
router.post('/', authorize('AGENT', 'ADMIN'), validate(schemas.createArticleSchema), controller.createArticle);
router.patch('/:id/submit', validateUuidParam('id'), validate(schemas.submitSchema), controller.submitArticle);
router.patch('/:id/publish', validateUuidParam('id'), authorize('ADMIN'), validate(schemas.publishSchema), controller.publishArticle);
router.patch('/:id/return-to-draft', validateUuidParam('id'), authorize('ADMIN'), validate(schemas.returnToDraftSchema), controller.returnArticle);
router.patch('/:id/archive', validateUuidParam('id'), authorize('ADMIN'), validate(schemas.archiveSchema), controller.archiveArticle);
router.patch('/:id/restore', validateUuidParam('id'), authorize('ADMIN'), validate(schemas.restoreSchema), controller.restoreArticle);
router.put('/:id/feedback', validateUuidParam('id'), validate(schemas.feedbackSchema), controller.voteFeedback);
router.delete('/:id/feedback', validateUuidParam('id'), controller.removeFeedback);
router.get('/:id/feedback-summary', validateUuidParam('id'), authorize('ADMIN'), controller.getFeedbackSummary);
router.patch('/:id', validateUuidParam('id'), authorize('AGENT', 'ADMIN'), validate(schemas.updateArticleSchema), controller.editArticle);
router.get('/:slug', controller.getArticle);

module.exports = router;
