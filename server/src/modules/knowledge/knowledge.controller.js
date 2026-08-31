const asyncHandler = require('../../utils/asyncHandler');
const knowledge = require('./knowledge.service');

const listArticles = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await knowledge.listArticles(req.user, req.query) });
});

const listSuggestions = asyncHandler(async (req, res) => {
  const articles = await knowledge.listSuggestions(req.user, req.query);
  res.status(200).json({ success: true, data: { articles } });
});

const getArticle = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { article: await knowledge.getArticleBySlug(req.user, req.params.slug) } });
});

const getManagementArticle = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { article: await knowledge.getManagementArticle(req.user, req.params.id) } });
});

const createArticle = asyncHandler(async (req, res) => {
  const article = await knowledge.createArticle(req.user, req.body);
  res.status(201).json({ success: true, data: { article } });
});

const editArticle = asyncHandler(async (req, res) => {
  const article = await knowledge.editArticle(req.user, req.params.id, req.body);
  res.status(200).json({ success: true, data: { article } });
});

function workflow(method) {
  return asyncHandler(async (req, res) => {
    const article = await method(req.user, req.params.id, req.body.version, req.body.reviewNote, req.body.targetStatus, req.requestId);
    res.status(200).json({ success: true, data: { article } });
  });
}

const submitArticle = workflow((user, id, version, _note, _target, requestId) => knowledge.submitArticle(user, id, version, requestId));
const publishArticle = workflow((user, id, version, _note, _target, requestId) => knowledge.publishArticle(user, id, version, requestId));
const returnArticle = workflow((user, id, version, reviewNote, _target, requestId) => knowledge.returnToDraft(user, id, version, reviewNote, requestId));
const archiveArticle = workflow((user, id, version, _note, _target, requestId) => knowledge.archiveArticle(user, id, version, requestId));
const restoreArticle = workflow((user, id, version, _note, targetStatus, requestId) => knowledge.restoreArticle(user, id, version, targetStatus, requestId));

const voteFeedback = asyncHandler(async (req, res) => {
  const feedback = await knowledge.voteFeedback(req.user, req.params.id, req.body.helpful);
  res.status(200).json({ success: true, data: { feedback } });
});

const removeFeedback = asyncHandler(async (req, res) => {
  await knowledge.removeFeedback(req.user, req.params.id);
  res.status(204).send();
});

const getFeedbackSummary = asyncHandler(async (req, res) => {
  const summary = await knowledge.feedbackSummary(req.user, req.params.id);
  res.status(200).json({ success: true, data: summary });
});

module.exports = {
  listArticles, listSuggestions, getArticle, getManagementArticle, createArticle, editArticle,
  submitArticle, publishArticle, returnArticle, archiveArticle, restoreArticle,
  voteFeedback, removeFeedback, getFeedbackSummary,
};
