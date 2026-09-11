const express = require('express');
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const uuid = require('../../middleware/validateUuidParam');
const asyncHandler = require('../../utils/asyncHandler');
const s = require('./personal.schema');
const service = require('./personal.service');
function base() {
  const router = express.Router();
  router.use(authenticate);
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  return router;
}
const views = base();
const shortcuts = base();
const json = (fn, status = 200) => asyncHandler(async (req, res) => {
  const data = await fn(req);
  if (status === 204) return res.status(204).send();
  res.status(status).json({ success: true, data });
});
views.get('/', validate(s.emptySchema, 'query'), json((r) => service.listViews(r.user)));
views.post('/', validate(s.createViewSchema), json((r) => service.createView(r.user, r.body), 201));
views.get('/:id/tickets', uuid('id'), validate(s.executeSchema, 'query'), json((r) => service.executeView(r.user, r.params.id, r.query)));
views.patch('/:id', uuid('id'), validate(s.updateViewSchema), json((r) => service.updateView(r.user, r.params.id, r.body)));
views.delete('/:id', uuid('id'), validate(s.deleteSchema), json((r) => service.deleteView(r.user, r.params.id, r.body), 204));
shortcuts.get('/', validate(s.emptySchema, 'query'), json((r) => service.listShortcuts(r.user)));
shortcuts.post('/', validate(s.createShortcutSchema), json((r) => service.createShortcut(r.user, r.body), 201));
shortcuts.patch('/reorder', validate(s.reorderSchema), json((r) => service.reorderShortcuts(r.user, r.body)));
shortcuts.patch('/:id', uuid('id'), validate(s.updateShortcutSchema), json((r) => service.updateShortcut(r.user, r.params.id, r.body)));
shortcuts.delete('/:id', uuid('id'), validate(s.deleteSchema), json((r) => service.updateShortcut(r.user, r.params.id, r.body, true), 204));
module.exports = { views, shortcuts };
