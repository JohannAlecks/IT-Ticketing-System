jest.mock('../../../config/prisma', () => ({ user: { findUnique: jest.fn(), findMany: jest.fn() }, ticket: { findMany: jest.fn() }, knowledgeArticle: { findMany: jest.fn() } }));
jest.mock('../../../utils/jwt', () => ({ verifyToken: jest.fn(() => ({ sub: 'owner' })) }));
const db = require('../../../config/prisma');
const { quickSchema, resultsSchema } = require('../search.schema');
const service = require('../search.service');
const router = require('../search.routes');
const errorHandler = require('../../../middleware/errorHandler');
const authenticate = require('../../../middleware/authenticate');
const { buildTicketVisibilityFilter } = require('../../tickets/ticket.access');
const { readPolicy } = require('../../knowledge/knowledge.service');
let current;
beforeEach(() => {
  jest.clearAllMocks(); current = { id: 'owner', role: 'USER', isActive: true, emailVerified: true };
  db.user.findUnique.mockImplementation(async () => current);
  for (const model of [db.user, db.ticket, db.knowledgeArticle]) model.findMany.mockResolvedValue([]);
});
const quick = (overrides = {}) => quickSchema.parse({ q: 'vp', ...overrides });
test('two meaningful characters, trimming and safe defaults', () => {
  expect(quick({ q: '  VPN   access  ' })).toEqual({ q: 'VPN access', type: 'all', limit: 5, includeArchived: false });
  expect(quick({ q: '网络' }).q).toBe('网络');
  expect(resultsSchema.parse({ q: 'vp' })).toMatchObject({ page: 1, pageSize: 20 });
});
test.each(['', ' ', 'a', ' a ', '%%', '--', '\u0000ab', 'ab\n', '\u200bab', 'a'.repeat(101)])('reject invalid query %#', (q) => expect(quickSchema.safeParse({ q }).success).toBe(false));
test.each([{ limit: '6' }, { limit: '0' }, { limit: '1e2' }, { limit: ['2'] }, { includeArchived: 'yes' }, { type: 'agents' }, { userId: 'forged' }, { scope: 'manage' }])('reject unknown/invalid quick parameters %j', (extra) => expect(quickSchema.safeParse({ q: 'ok', ...extra }).success).toBe(false));
test.each([{ page: '101' }, { page: '-1' }, { pageSize: '21' }, { pageSize: '1.5' }, { page: '01' }, { limit: '5' }])('reject unbounded full pagination %j', (extra) => expect(resultsSchema.safeParse({ q: 'ok', ...extra }).success).toBe(false));
test.each(['USER', 'AGENT', 'ADMIN'])('%s authorization is intersected inside ticket and article queries', async (role) => {
  current.role = role;
  const output = await service.search({ id: current.id, role: 'ADMIN' }, quick());
  const call = db.ticket.findMany.mock.calls[0][0];
  expect(call.where.AND).toEqual(expect.arrayContaining([buildTicketVisibilityFilter(current), { archivedAt: null }]));
  expect(call).toMatchObject({ take: 6, skip: 0, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
  expect(db.knowledgeArticle.findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([readPolicy(current), { status: 'PUBLISHED', archivedAt: null }]));
  expect(output.groups.map((g) => g.type)).toEqual(role === 'ADMIN' ? ['tickets', 'knowledge', 'users'] : ['tickets', 'knowledge']);
  expect(db.user.findMany).toHaveBeenCalledTimes(role === 'ADMIN' ? 1 : 0);
});
test.each(['USER', 'AGENT', 'ADMIN'])('%s explicit archived search retains the original ownership filter', async (role) => {
  current.role = role; await service.search(current, quick({ includeArchived: 'true', type: 'tickets' }));
  expect(db.ticket.findMany.mock.calls[0][0].where.AND.slice(0, 2)).toEqual([buildTicketVisibilityFilter(current), {}]);
});
test.each(['USER', 'AGENT'])('%s cannot explicitly search directory', async (role) => {
  current.role = role; await expect(service.search(current, quick({ type: 'users' }))).rejects.toMatchObject({ statusCode: 403 });
  expect(db.user.findMany).not.toHaveBeenCalled();
});
test('current role and activation override stale account data', async () => {
  await expect(service.search({ id: 'owner', role: 'ADMIN' }, quick({ type: 'users' }))).rejects.toMatchObject({ statusCode: 403 });
  current.isActive = false; await expect(service.search(current, quick())).rejects.toMatchObject({ statusCode: 401 });
  current.isActive = true; current.emailVerified = false; await expect(service.search(current, quick())).rejects.toMatchObject({ statusCode: 401 });
  current = null; await expect(service.search({ id: 'owner' }, quick())).rejects.toMatchObject({ statusCode: 401 });
  expect(db.ticket.findMany).not.toHaveBeenCalled();
});
test('projections and response allowlists omit content and security fields even if extra data reaches the mapper', async () => {
  current.role = 'ADMIN'; const secret = { description: 'hidden description', password: 'hidden hash', token: 'hidden token', content: 'hidden body', comments: ['hidden comment'] };
  db.ticket.findMany.mockResolvedValue([{ ...secret, id: 'abcd1234', title: '<img>VPN issue', status: 'OPEN', category: 'VPN', createdBy: { name: 'Requester', email: 'hidden email' }, assignedTo: null, updatedAt: '2026-09-11' }]);
  db.knowledgeArticle.findMany.mockResolvedValue([{ ...secret, id: 'kb', slug: 'vpn-access', title: 'VPN', summary: '<b>Plain summary</b>', ticketCategory: 'VPN' }]);
  db.user.findMany.mockResolvedValue([{ ...secret, id: 'staff', name: 'Staff', email: 'staff@example.test', role: 'AGENT', isActive: false }]);
  const output = await service.search(current, quick());
  expect(JSON.stringify(output)).not.toMatch(/hidden|<img>|<b>/);
  expect(output.groups[0].results[0]).toMatchObject({ path: '/tickets/abcd1234', metadata: { archived: false } });
  expect(output.groups[1].results[0]).toMatchObject({ subtitle: 'Plain summary', path: '/knowledge/vpn-access' });
  expect(output.groups[2].results[0]).toMatchObject({ path: '/users?status=ALL#user-staff', metadata: { active: false } });
  for (const model of [db.ticket, db.knowledgeArticle, db.user]) {
    const { select, include } = model.findMany.mock.calls[0][0]; expect(include).toBeUndefined();
    for (const key of ['description', 'comments', 'attachments', 'content', 'password', 'emailVerified', 'token', 'feedback', 'auditEvents']) expect(select[key]).toBeUndefined();
  }
});
test('admin directory matches status/name/email/department/role without active-only default', async () => {
  current.role = 'ADMIN'; await service.search(current, quick({ type: 'users', q: 'inactive' }));
  expect(db.user.findMany.mock.calls[0][0].where.OR).toContainEqual({ isActive: false });
});
test('metacharacters cannot widen the query or replace authorization', async () => {
  const q = "ab%' OR 1=1 --_\\"; await service.search(current, quick({ q }));
  expect(db.ticket.findMany.mock.calls[0][0].where.AND[0]).toEqual({ createdById: 'owner' });
  expect(db.ticket.findMany.mock.calls[0][0].where.AND[2].OR[0]).toEqual({ title: { contains: service.literal(q), mode: 'insensitive' } });
  expect(service.literal('%_\\')).toBe('\\%\\_\\\\');
});
test('identifier prefix, category, status, and visible relation names are searchable, not descriptions', async () => {
  await service.search(current, quick({ q: '#abcd1234' }));
  expect(db.ticket.findMany.mock.calls[0][0].where.AND[2].OR).toContainEqual({ id: { startsWith: 'abcd1234', mode: 'insensitive' } });
  expect(JSON.stringify(db.ticket.findMany.mock.calls[0][0].where)).not.toMatch(/description|comments|feedback/);
  expect(service.ticketWhere(current, quick({ q: 'open' })).AND[2].OR).toContainEqual({ status: { in: ['OPEN'] } });
});
test('full pages use bounded lookahead without counts and valid empty results', async () => {
  db.ticket.findMany.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: 'VPN' })));
  const output = await service.search(current, resultsSchema.parse({ q: 'vp', type: 'tickets', page: '2', pageSize: '3' }), 'full');
  expect(db.ticket.findMany.mock.calls[0][0]).toMatchObject({ skip: 3, take: 4 });
  expect(output.groups[0].results).toHaveLength(3); expect(output.groups[0].hasMore).toBe(true);
  db.ticket.findMany.mockResolvedValue([]); expect((await service.search(current, quick({ type: 'tickets' }))).groups[0]).toEqual({ type: 'tickets', results: [], hasMore: false });
});
test('database failures become a safe 503', async () => {
  db.ticket.findMany.mockRejectedValue(new Error('raw SQL and private query input'));
  await expect(service.search(current, quick())).rejects.toMatchObject({ statusCode: 503, message: 'Search is temporarily unavailable. Please try again.' });
});
function responseFor(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    const next = (error) => { if (error) errorHandler(error, req, res, reject); else resolve({ status: 200 }); };
    try { handler(req, res, next); } catch (e) { next(e); }
  });
}
test('real authentication rejects missing token and rereads the database role', async () => {
  expect(router.stack[1].handle).toBe(authenticate);
  expect((await responseFor(authenticate, { headers: {} })).status).toBe(401);
  const req = { headers: { authorization: 'Bearer fixture' } }; expect((await responseFor(authenticate, req)).status).toBe(200); expect(req.user.role).toBe('USER');
  current.isActive = false; expect((await responseFor(authenticate, req)).status).toBe(401);
});
test('route validates without echoing input, sets privacy headers, and rejects forbidden type', async () => {
  const res = { set: jest.fn() }; router.stack[0].handle({}, res, () => {}); expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  const handler = router.stack.find((l) => l.route?.path === '/').route.stack[0].handle;
  expect((await responseFor(handler, { user: current, query: { q: 'ok', 'private-input': 'hidden' } })).body.message).not.toMatch(/private-input|hidden/);
  expect((await responseFor(handler, { user: current, query: { q: 'ok', type: 'users' } })).status).toBe(403);
  expect((await responseFor(handler, { user: current, query: { q: 'ok' } })).body).toMatchObject({ success: true, data: { page: 1 } });
});
