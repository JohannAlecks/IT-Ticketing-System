const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const uuid = require('../../middleware/validateUuidParam');
const AppError = require('../../utils/AppError');
const { watching } = require('./watcher.service');
// Mounted after ticket authentication. No arbitrary recipient or watcher list.
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
for (const [method, path, action] of [['get', '/:id/watching', 'read'], ['post', '/:id/watch', 'watch'], ['delete', '/:id/watch', 'unwatch']]) {
  router[method](path, uuid('id'), asyncHandler(async (req, res) => {
    if (Object.keys(req.query).length) throw new AppError('Invalid watcher request', 422);
    res.json({ success: true, data: await watching(req.user, req.params.id, action, req.body || {}) });
  }));
}
module.exports = router;
