const authenticate = require('../../../middleware/authenticate');
const routes = require('../sla.routes');

test('every SLA policy route is behind authentication and the actual Admin-only middleware', () => {
  expect(routes.stack[0].handle).toBe(authenticate);
  expect(routes.stack.filter((layer) => layer.route).map((layer) => layer.route.path)).toEqual(['/policies', '/policies/:id']);
  for (const role of ['USER', 'AGENT']) {
    expect(() => routes.stack[1].handle({ user: { role } }, {}, jest.fn())).toThrow(expect.objectContaining({ statusCode: 403 }));
  }
  const next = jest.fn();
  routes.stack[1].handle({ user: { role: 'ADMIN' } }, {}, next);
  expect(next).toHaveBeenCalledWith();
});
