const authenticate = require('../../../middleware/authenticate');
const routes = require('../notification.routes');

test('notification router authenticates every route and registers read-all before parameter routes', () => {
  expect(routes.stack[0].handle).toBe(authenticate);
  expect(routes.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`))
    .toEqual(['get /', 'get /unread-count', 'patch /read-all', 'patch /:id/read', 'patch /:id/unread']);
});

test('authentication boundary returns 401 without a bearer token', async () => {
  await new Promise((resolve) => authenticate({ headers: {} }, {}, (error) => {
    expect(error).toMatchObject({ statusCode: 401 });
    resolve();
  }));
});
