/*
 * Optional, local-only integration coverage. It never migrates/resets a database
 * and cleanup is restricted to rows created with this suite's UUID prefix.
 */
const { randomUUID } = require('crypto');

const { enabled, describeDb } = require('../../../../testUtils/databaseSuite');
const skipReason = 'requires the centralized dedicated test-database guard';

describeDb(`knowledge database integration (${skipReason})`, () => {
  const prisma = require('../../../config/prisma');
  const service = require('../knowledge.service');
  const prefix = `knowledge-it-${randomUUID()}`;
  const userIds = [];
  const articleIds = [];
  let author;
  let reader;
  let admin;
  let failAuditFor;
  prisma.$use((params, next) => {
    if (failAuditFor && params.model === 'AuditEvent' && params.action === 'create' && params.args.data.entityId === failAuditFor) throw new Error('Synthetic knowledge audit failure');
    return next(params);
  });
  const createUser = async (role) => {
    const result = await prisma.user.create({ data: { name: `${prefix}-${role}`, email: `${prefix}-${randomUUID()}@example.test`, password: 'not-used-in-direct-db-tests', role, isActive: true, emailVerified: true } });
    userIds.push(result.id);
    return result;
  };
  const createArticle = async (overrides = {}) => {
    const result = await prisma.knowledgeArticle.create({ data: { title: `${prefix} article`, slug: `${prefix}-${randomUUID()}`, summary: 'A meaningful integration test summary.', content: 'A meaningful integration test body with more than twenty characters.', status: 'PUBLISHED', visibility: 'PUBLIC', authorId: author.id, publishedAt: new Date(), ...overrides } });
    articleIds.push(result.id);
    return result;
  };

  beforeAll(async () => { await prisma.$connect(); [author, reader, admin] = await Promise.all([createUser('AGENT'), createUser('USER'), createUser('ADMIN')]); });
  afterAll(async () => {
    if (userIds.length) {
      await prisma.notification.deleteMany({
        where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] },
      });
    }
    if (articleIds.length) {
      await prisma.articleFeedback.deleteMany({ where: { articleId: { in: articleIds } } });
      await prisma.auditEvent.deleteMany({ where: { entityType: 'knowledge_article', entityId: { in: articleIds } } });
      await prisma.knowledgeArticle.deleteMany({ where: { id: { in: articleIds } } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    expect(await prisma.knowledgeArticle.count({ where: { id: { in: articleIds } } })).toBe(0);
    expect(await prisma.articleFeedback.count({ where: { articleId: { in: articleIds } } })).toBe(0);
    expect(await prisma.notification.count({ where: { articleId: { in: articleIds } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityId: { in: articleIds } } })).toBe(0);
    await prisma.$disconnect();
  });

  test('stale conditional workflow transition permits exactly one submit', async () => {
    const draft = await createArticle({ status: 'DRAFT', publishedAt: null });
    const results = await Promise.allSettled([service.submitArticle(author, draft.id, 1), service.submitArticle(author, draft.id, 1)]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((item) => item.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
    expect((await prisma.knowledgeArticle.findUnique({ where: { id: draft.id } })).status).toBe('IN_REVIEW');
  });
  test('feedback upsert maintains the unique article/viewer vote', async () => {
    const published = await createArticle();
    await service.voteFeedback(reader, published.id, true);
    await service.voteFeedback(reader, published.id, false);
    expect(await prisma.articleFeedback.count({ where: { articleId: published.id, userId: reader.id } })).toBe(1);
  });
  test('published public content remains readable after author deactivation', async () => {
    const published = await createArticle();
    await prisma.user.update({ where: { id: author.id }, data: { isActive: false } });
    await expect(service.getArticleBySlug(reader, published.slug)).resolves.toMatchObject({ id: published.id });
    await prisma.user.update({ where: { id: author.id }, data: { isActive: true } });
  });
  test('draft review/return/publish/archive/restore keeps requester visibility authoritative', async () => {
    const draft = await createArticle({ status: 'DRAFT', publishedAt: null });
    await expect(service.getArticleBySlug(reader, draft.slug)).rejects.toMatchObject({ statusCode: 404 });
    await service.submitArticle(author, draft.id, 1);
    await expect(service.publishArticle(author, draft.id, 2)).rejects.toMatchObject({ statusCode: 403 });
    await service.returnToDraft(admin, draft.id, 2, 'Synthetic review note');
    await service.submitArticle(author, draft.id, 3);
    await service.publishArticle(admin, draft.id, 4);
    await expect(service.getArticleBySlug(reader, draft.slug)).resolves.toMatchObject({ id: draft.id });
    await service.archiveArticle(admin, draft.id, 5);
    await expect(service.getArticleBySlug(reader, draft.slug)).rejects.toMatchObject({ statusCode: 404 });
    await service.restoreArticle(admin, draft.id, 6, 'PUBLISHED');
    expect(await prisma.knowledgeArticle.findUnique({ where: { id: draft.id } })).toMatchObject({ status: 'PUBLISHED', version: 7 });
  });
  test('audit failure rolls back workflow state and notification publication', async () => {
    const draft = await createArticle({ status: 'DRAFT', publishedAt: null });
    const before = await prisma.knowledgeArticle.findUnique({ where: { id: draft.id } }); failAuditFor = draft.id;
    try { await expect(service.submitArticle(author, draft.id, 1)).rejects.toThrow('Synthetic knowledge audit failure'); }
    finally { failAuditFor = null; }
    expect(await prisma.knowledgeArticle.findUnique({ where: { id: draft.id } })).toEqual(before);
    expect(await prisma.auditEvent.count({ where: { entityId: draft.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { articleId: draft.id } })).toBe(0);
  });
});
