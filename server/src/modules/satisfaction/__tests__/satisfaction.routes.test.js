const authenticate = require('../../../middleware/authenticate');
const validateUuid = require('../../../middleware/validateUuidParam');
const { router, ticketRouter } = require('../satisfaction.routes');
const reports = require('../../reports/report.routes');
test('self summary endpoints authenticate and nested feedback mounts below ticket authentication', () => {
  expect(router.stack[0].handle).toBe(authenticate);
  expect(router.stack.filter((l) => l.route).map((l) => l.route.path)).toEqual(['/me', '/summary']);
  const tickets = require('../../tickets/ticket.routes');
  expect(tickets.stack[0].handle).toBe(authenticate);
  expect(tickets.stack[1].handle).toBe(ticketRouter);
  const next = jest.fn(); validateUuid('ticketId')({ params: { ticketId: 'malformed' } }, {}, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
});
test('CSAT reports remain behind existing Agent/Admin authorization', () => {
  expect(reports.stack[0].handle).toBe(authenticate);
  expect(() => reports.stack[1].handle({ user: { role: 'USER' } }, {}, jest.fn())).toThrow();
  expect(reports.stack.find((l) => l.route?.path === '/satisfaction')).toBeTruthy();
});
