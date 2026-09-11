const mockWatching = jest.fn();
jest.mock('../watcher.service', () => ({ watching: mockWatching }));
const router = require('../watcher.routes');
test('watcher router is mounted after ticket authentication', () => {
  const tickets = require('../../tickets/ticket.routes');
  expect(tickets.stack[0].handle).toBe(require('../../../middleware/authenticate'));
  expect(tickets.stack.findIndex((layer) => layer.handle === router)).toBeGreaterThan(0);
});
test.each([['get', '/:id/watching', 'read'], ['post', '/:id/watch', 'watch'], ['delete', '/:id/watch', 'unwatch']])('%s %s binds authenticated identity and validates identifier', async (method, path, action) => {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const next = jest.fn(); route.stack[0].handle({ params: { id: 'bad' } }, {}, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  const user = { id: 'authenticated' }; const id = '11111111-1111-4111-8111-111111111111';
  mockWatching.mockResolvedValue({ isWatching: action !== 'unwatch' }); const res = { json: jest.fn() };
  await route.stack[1].handle({ user, params: { id }, query: {}, body: {} }, res, next);
  expect(mockWatching).toHaveBeenLastCalledWith(user, id, action, {});
  expect(res.json).toHaveBeenCalledWith({ success: true, data: { isWatching: action !== 'unwatch' } });
  mockWatching.mockClear(); next.mockClear();
  await route.stack[1].handle({ user, params: { id }, query: { userId: 'other' } }, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 })); expect(mockWatching).not.toHaveBeenCalled();
});
