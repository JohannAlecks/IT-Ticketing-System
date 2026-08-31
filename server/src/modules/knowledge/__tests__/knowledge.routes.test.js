const authenticate = require('../../../middleware/authenticate');
const knowledgeRoutes = require('../knowledge.routes');

test('knowledge router authenticates every route and keeps static paths before the slug route', () => {
  expect(knowledgeRoutes.stack[0].handle).toBe(authenticate);
  const paths = knowledgeRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  expect(paths.indexOf('/suggestions')).toBeLessThan(paths.indexOf('/:slug'));
  expect(paths.indexOf('/manage/:id')).toBeLessThan(paths.indexOf('/:slug'));
  expect(paths[paths.length - 1]).toBe('/:slug');
});
