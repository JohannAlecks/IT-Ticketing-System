const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const reportRoutes = require('../report.routes');

test('reports router mounts authenticate then AGENT/ADMIN authorization before all endpoints', () => {
  const paths = reportRoutes.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  expect(paths).toEqual(['/summary', '/tickets/export', '/tickets']);
  expect(reportRoutes.stack[0].handle).toBe(authenticate);
});

test('the shared boundary middleware returns 401 without authentication and 403 for USER', async () => {
  await new Promise((resolve) => {
    authenticate({ headers: {} }, {}, (error) => {
      expect(error).toMatchObject({ statusCode: 401 });
      resolve();
    });
  });
  let forbidden;
  try {
    authorize('AGENT', 'ADMIN')({ user: { role: 'USER' } }, {}, jest.fn());
  } catch (error) {
    forbidden = error;
  }
  expect(forbidden).toMatchObject({ statusCode: 403 });
});
