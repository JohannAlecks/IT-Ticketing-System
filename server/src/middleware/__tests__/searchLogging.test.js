jest.mock('../../config/env', () => ({ LOG_FORMAT: 'text' }));
const env = require('../../config/env');
const logger = require('../requestLogger');
test.each(['json', 'text'])('%s request logging never includes search terms or result contents', (format) => {
  env.LOG_FORMAT = format; const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const req = { method: 'GET', path: '/api/search', originalUrl: '/api/search?q=private-query', requestId: 'req-1', user: { id: 'owner' } };
    const res = { statusCode: 200, on: (event, fn) => fn() }; logger(req, res, () => {});
    expect(spy.mock.calls[0][0]).not.toContain('private-query');
  } finally { spy.mockRestore(); }
});
