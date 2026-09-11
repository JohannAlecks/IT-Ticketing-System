const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const rateLimit = require('../../middleware/rateLimit');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { quickSchema, resultsSchema } = require('./search.schema');
const { search } = require('./search.service');
// Set privacy headers even on rejected requests.
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate);
router.use(rateLimit({ windowMs: 60_000, max: 60, keyGenerator: (req) => req.user.id }));
function handle(schema, mode) {
  return asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.query);
    // Zod's unknown-key message includes attacker-supplied names: keep it out.
    if (!parsed.success) throw new AppError('Invalid search parameters. Use 2–100 characters and bounded pagination.', 422);
    res.json({ success: true, data: await search(req.user, parsed.data, mode) });
  });
}
router.get('/', handle(quickSchema, 'quick'));
router.get('/results', handle(resultsSchema, 'full'));
module.exports = router;
