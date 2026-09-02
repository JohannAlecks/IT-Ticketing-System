/*
 * Optional, local-only integration coverage. It never migrates/resets a database
 * and cleanup is restricted to rows created with this suite's UUID prefix.
 */
const { randomUUID } = require('crypto');

const DEFAULT_JEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
if (process.env.DATABASE_URL === DEFAULT_JEST_DATABASE_URL) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
}
const localDatabaseIsSafe = () => {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    return new Set(['localhost', '127.0.0.1', '::1']).has(url.hostname)
      && (/test/i.test(url.pathname) || process.env.ALLOW_NON_TEST_DB_INTEGRATION === 'true');
  } catch { return false; }
};
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true' && localDatabaseIsSafe();
const describeDb = enabled ? describe : describe.skip;
const skipReason = 'requires RUN_DB_INTEGRATION_TESTS=true and a local PostgreSQL test database (or explicit ALLOW_NON_TEST_DB_INTEGRATION=true)';

describeDb(`knowledge database integration (${skipReason})`, () => {
  const prisma = require('../../../config/prisma');
  const service = require('../knowledge.service');
  const prefix = `knowledge-it-${randomUUID()}`;
  const userIds = [];
  const articleIds = [];
  let author;
  let reader;
  let admin;
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
    await prisma.$disconnect();
  });

  test('stale conditional workflow transition permits exactly one submit', async () => {
    const draft = await createArticle({ status: 'DRAFT', publishedAt: null });
    const results = await Promise.allSettled([service.submitArticle(author, draft.id, 1), service.submitArticle(author, draft.id, 1)]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
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
});

if (!enabled) test.skip(`knowledge DB integration skipped: ${skipReason}`, () => {});
