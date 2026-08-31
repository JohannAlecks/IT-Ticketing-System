const mockPrisma = {
  knowledgeArticle: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  articleFeedback: { upsert: jest.fn(), deleteMany: jest.fn(), groupBy: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../../../config/prisma', () => mockPrisma);

const service = require('../knowledge.service');
const schemas = require('../knowledge.schema');
const AppError = require('../../../utils/AppError');

const user = { id: '11111111-1111-4111-8111-111111111111', role: 'USER' };
const agent = { id: '22222222-2222-4222-8222-222222222222', role: 'AGENT' };
const admin = { id: '33333333-3333-4333-8333-333333333333', role: 'ADMIN' };
const id = '44444444-4444-4444-8444-444444444444';
const article = (overrides = {}) => ({ id, slug: 'network-help', title: 'Network help article', summary: 'A useful article summary.', content: 'This is enough safe plain text content for publication.', status: 'DRAFT', visibility: 'INTERNAL', ticketCategory: 'OTHERS', tags: [], version: 1, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (callback) => callback({ knowledgeArticle: mockPrisma.knowledgeArticle, auditEvent: mockPrisma.auditEvent }));
});

test('1. USER read policy is published public only', () => expect(service.readPolicy(user)).toEqual({ status: 'PUBLISHED', visibility: 'PUBLIC' }));
test('2. AGENT read policy includes published internal articles', () => expect(service.readPolicy(agent)).toEqual({ status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'INTERNAL'] } }));
test('3. AGENT management policy is restricted to the author and non-archived workflow states', () => expect(service.managementPolicy(agent)).toEqual({ authorId: agent.id, status: { in: ['DRAFT', 'IN_REVIEW', 'PUBLISHED'] } }));
test('4. USER cannot use the management scope', () => expect(() => service.listWhere(user, { scope: 'manage' })).toThrow(AppError));
test('5. USER status and visibility query attempts cannot broaden the policy', () => expect(service.listWhere(user, { status: 'DRAFT', visibility: 'INTERNAL' })).toEqual({ AND: [{ status: 'PUBLISHED', visibility: 'PUBLIC' }] }));
test('6. search is nested under the authorized AND predicate', () => {
  const where = service.listWhere(user, { search: 'vpn' });
  expect(where.AND[0]).toEqual({ status: 'PUBLISHED', visibility: 'PUBLIC' });
  expect(where.AND[1].OR).toHaveLength(3);
});
test('7. list sorting always ends with a stable id tiebreaker', () => expect(service.orderFor('updated')).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]));
test('8. list projection excludes article content and identities', () => {
  expect(service.listSelect).not.toHaveProperty('content');
  expect(service.listSelect).not.toHaveProperty('author');
});
test('9. list returns a constrained pagination envelope', async () => {
  mockPrisma.knowledgeArticle.findMany.mockResolvedValue([article()]);
  mockPrisma.knowledgeArticle.count.mockResolvedValue(1);
  await expect(service.listArticles(user, { page: 1, limit: 20, sort: 'published' })).resolves.toMatchObject({ pagination: { page: 1, total: 1, totalPages: 1 } });
});
test('9a. management list includes only the workflow fields required by the client', async () => {
  mockPrisma.knowledgeArticle.findMany.mockResolvedValue([article({ author: { id: agent.id, name: 'Agent' } })]);
  mockPrisma.knowledgeArticle.count.mockResolvedValue(1);
  await service.listArticles(agent, { scope: 'manage', status: 'DRAFT', page: 1, limit: 20, sort: 'updated' });
  const select = mockPrisma.knowledgeArticle.findMany.mock.calls[0][0].select;
  expect(select).toMatchObject({ version: true, reviewNote: true, author: { select: { id: true, name: true } } });
  expect(select).not.toHaveProperty('content');
});
test('10. USER suggestions are limited to published public content', async () => {
  mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);
  await service.listSuggestions(user, { category: 'VPN', limit: 3 });
  expect(mockPrisma.knowledgeArticle.findMany.mock.calls[0][0].where.AND[0]).toEqual({ status: 'PUBLISHED', visibility: { in: ['PUBLIC'] } });
});
test('11. staff suggestions can include published internal support content', async () => {
  mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);
  await service.listSuggestions(agent, { category: 'VPN', limit: 3 });
  expect(mockPrisma.knowledgeArticle.findMany.mock.calls[0][0].where.AND[0].visibility.in).toEqual(['PUBLIC', 'INTERNAL']);
});
test('12. inaccessible slug details return a non-revealing 404', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(null);
  await expect(service.getArticleBySlug(user, 'secret')).rejects.toMatchObject({ statusCode: 404 });
});
test('13. published detail returns only the current viewer feedback value', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue({ ...article({ status: 'PUBLISHED', visibility: 'PUBLIC' }), feedback: [{ helpful: true }] });
  await expect(service.getArticleBySlug(user, 'network-help')).resolves.toMatchObject({ viewerFeedback: true });
});
test('14. management detail blocks an AGENT from a peer article', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(null);
  await expect(service.getManagementArticle(agent, id)).rejects.toMatchObject({ statusCode: 404 });
  expect(mockPrisma.knowledgeArticle.findFirst.mock.calls[0][0].where.AND[0]).toEqual(service.managementPolicy(agent));
});
test('15. create ignores server-controlled workflow fields and authors from the actor', async () => {
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(null);
  mockPrisma.knowledgeArticle.create.mockResolvedValue(article());
  await service.createArticle(agent, { title: 'Network help article', summary: '', content: '', tags: [] });
  const data = mockPrisma.knowledgeArticle.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ authorId: agent.id });
  expect(data).not.toHaveProperty('status');
  expect(data).not.toHaveProperty('reviewedById');
});
test('16. slug base is lower ASCII-safe and immutable input is not accepted by schema', () => {
  expect(service.slugBase('Héllo, VPN!')).toBe('hello-vpn');
  expect(schemas.createArticleSchema.safeParse({ title: 'Valid title', slug: 'trusted' }).success).toBe(false);
});
test('17. edit uses a conditional DRAFT/version update and increments version', async () => {
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article({ version: 2 }));
  await service.editArticle(agent, id, { title: 'Updated title', version: 1 });
  expect(mockPrisma.knowledgeArticle.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id, status: 'DRAFT', version: 1, authorId: agent.id }, data: { title: 'Updated title', version: { increment: 1 } } }));
});
test('18. a stale edit is rejected with 409', async () => {
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.editArticle(admin, id, { title: 'Updated title', version: 1 })).rejects.toMatchObject({ statusCode: 409 });
});
test('19. submit conditionally transitions an AGENT own draft and clears review notes', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ authorId: agent.id }));
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article({ status: 'IN_REVIEW', version: 2 }));
  await service.submitArticle(agent, id, 1);
  expect(mockPrisma.knowledgeArticle.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id, status: 'DRAFT', version: 1, authorId: agent.id }, data: expect.objectContaining({ status: 'IN_REVIEW', reviewNote: null }) }));
});
test('20. workflow transitions atomically audit safe status metadata', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ authorId: agent.id }));
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article());
  await service.submitArticle(agent, id, 1);
  expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: 'knowledge_article', metadata: expect.objectContaining({ fromStatus: 'DRAFT', toStatus: 'IN_REVIEW', version: 2 }) }) });
});
test('21. publish rejects incomplete review content before transition', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ status: 'IN_REVIEW', summary: 'short' }));
  await expect(service.publishArticle(admin, id, 1)).rejects.toMatchObject({ statusCode: 422 });
});
test('22. publish assigns the current admin reviewer and server publication timestamp', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ status: 'IN_REVIEW' }));
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article({ status: 'PUBLISHED' }));
  await service.publishArticle(admin, id, 1);
  expect(mockPrisma.knowledgeArticle.updateMany.mock.calls[0][0].data).toMatchObject({ reviewedById: admin.id, archivedAt: null });
});
test('23. return-to-draft persists only the validated reviewer note', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ status: 'IN_REVIEW' }));
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article());
  await service.returnToDraft(admin, id, 1, 'Clarify the recovery steps.');
  expect(mockPrisma.knowledgeArticle.updateMany.mock.calls[0][0].data.reviewNote).toBe('Clarify the recovery steps.');
});
test('24. archive and restore retain publishedAt while clearing archivedAt', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue(article({ status: 'ARCHIVED', publishedAt: new Date() }));
  mockPrisma.knowledgeArticle.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(article({ status: 'PUBLISHED' }));
  await service.restoreArticle(admin, id, 1, 'PUBLISHED');
  const data = mockPrisma.knowledgeArticle.updateMany.mock.calls[0][0].data;
  expect(data).toMatchObject({ status: 'PUBLISHED', reviewedById: admin.id, archivedAt: null });
  expect(data).not.toHaveProperty('publishedAt');
});
test('25. feedback upserts one current-user vote only after readable policy lookup', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue({ id });
  mockPrisma.articleFeedback.upsert.mockResolvedValue({ helpful: true });
  await service.voteFeedback(user, id, true);
  expect(mockPrisma.articleFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { articleId_userId: { articleId: id, userId: user.id } } }));
});
test('26. feedback deletion is idempotent and does not expose inaccessible articles', async () => {
  mockPrisma.knowledgeArticle.findFirst.mockResolvedValue({ id });
  mockPrisma.articleFeedback.deleteMany.mockResolvedValue({ count: 0 });
  await expect(service.removeFeedback(user, id)).resolves.toBeUndefined();
});
test('27. feedback summary is admin-only and contains aggregates, never voter identities', async () => {
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue({ id });
  mockPrisma.articleFeedback.groupBy.mockResolvedValue([{ helpful: true, _count: { _all: 2 } }, { helpful: false, _count: { _all: 1 } }]);
  await expect(service.feedbackSummary(admin, id)).resolves.toEqual({ helpful: 2, notHelpful: 1, total: 3 });
  await expect(service.feedbackSummary(user, id)).rejects.toMatchObject({ statusCode: 403 });
});
test('28. feedback summary returns 404 for an unknown article', async () => {
  mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(null);
  await expect(service.feedbackSummary(admin, id)).rejects.toMatchObject({ statusCode: 404 });
  expect(mockPrisma.articleFeedback.groupBy).not.toHaveBeenCalled();
});
