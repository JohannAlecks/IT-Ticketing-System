const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

const ARTICLE_ENTITY = 'knowledge_article';
const STAFF_ROLES = new Set(['AGENT', 'ADMIN']);
const ALL_ROLES = new Set(['USER', 'AGENT', 'ADMIN']);

const listSelect = {
  id: true, slug: true, title: true, summary: true, status: true, visibility: true,
  ticketCategory: true, tags: true, publishedAt: true, createdAt: true, updatedAt: true,
};
const safePerson = { select: { id: true, name: true } };
const detailSelect = {
  ...listSelect, content: true, author: safePerson, reviewedBy: safePerson,
};
const managementListSelect = { ...listSelect, version: true, reviewNote: true, author: safePerson };
const managementSelect = { ...detailSelect, version: true, reviewNote: true, archivedAt: true, authorId: true, reviewedById: true };

function assertRole(user) {
  if (!user || !ALL_ROLES.has(user.role)) throw new AppError('You do not have permission to perform this action', 403);
}

function assertStaff(user) {
  assertRole(user);
  if (!STAFF_ROLES.has(user.role)) throw new AppError('You do not have permission to perform this action', 403);
}

function readPolicy(user) {
  assertRole(user);
  if (user.role === 'USER') return { status: 'PUBLISHED', visibility: 'PUBLIC' };
  if (user.role === 'AGENT') return { status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'INTERNAL'] } };
  return {};
}

function managementPolicy(user) {
  assertRole(user);
  if (user.role === 'ADMIN') return {};
  if (user.role === 'AGENT') return { authorId: user.id, status: { in: ['DRAFT', 'IN_REVIEW', 'PUBLISHED'] } };
  throw new AppError('You do not have permission to perform this action', 403);
}

function searchClause(search) {
  if (!search) return null;
  return { OR: [
    { title: { contains: search, mode: 'insensitive' } },
    { summary: { contains: search, mode: 'insensitive' } },
    { tags: { has: search.toLowerCase() } },
  ] };
}

function listWhere(user, query) {
  const scope = query.scope || 'read';
  if (scope === 'manage' && user.role === 'USER') throw new AppError('You do not have permission to perform this action', 403);
  const policy = scope === 'manage' ? managementPolicy(user) : readPolicy(user);
  const filters = [];
  if (query.category) filters.push({ ticketCategory: query.category });
  // A USER's supplied visibility/status can never loosen its public published policy.
  if (user.role !== 'USER') {
    if (query.status) filters.push({ status: query.status });
    if (query.visibility) filters.push({ visibility: query.visibility });
  }
  const search = searchClause(query.search);
  if (search) filters.push(search);
  return { AND: [policy, ...filters] };
}

function readableWhere(user, extra = {}) {
  return { AND: [readPolicy(user), extra] };
}

function orderFor(sort) {
  return sort === 'updated'
    ? [{ updatedAt: 'desc' }, { id: 'desc' }]
    : [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
}

function incompleteArticle(article) {
  return !article || article.title.trim().length < 5 || article.summary.trim().length < 10 || article.content.trim().length < 20 || !article.visibility || !article.ticketCategory;
}

function slugBase(title) {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
  return base || 'article';
}

async function uniqueSlug(title) {
  const base = slugBase(title);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    // This friendly pre-check avoids the common collision path; create retries still
    // handle concurrent creators racing for the same title.
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.knowledgeArticle.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  throw new AppError('Could not allocate a unique article slug', 409);
}

async function listArticles(user, query) {
  assertRole(user);
  const where = listWhere(user, query);
  const select = query.scope === 'manage' ? managementListSelect : listSelect;
  const page = query.page || 1;
  const limit = query.limit || 20;
  const [articles, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({ where, select, orderBy: orderFor(query.sort), skip: (page - 1) * limit, take: limit }),
    prisma.knowledgeArticle.count({ where }),
  ]);
  return { articles, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function listSuggestions(user, query) {
  assertRole(user);
  const where = { AND: [
    { status: 'PUBLISHED', visibility: { in: user.role === 'USER' ? ['PUBLIC'] : ['PUBLIC', 'INTERNAL'] } },
    { ticketCategory: query.category },
    ...(searchClause(query.search) ? [searchClause(query.search)] : []),
  ] };
  return prisma.knowledgeArticle.findMany({ where, select: listSelect, orderBy: orderFor('published'), take: query.limit || 3 });
}

async function getArticleBySlug(user, slug) {
  assertRole(user);
  const article = await prisma.knowledgeArticle.findFirst({
    where: readableWhere(user, { slug }),
    select: {
      ...detailSelect,
      feedback: { where: { userId: user.id }, select: { helpful: true } },
    },
  });
  if (!article) throw new AppError('Knowledge article not found', 404);
  const { feedback, ...safe } = article;
  return { ...safe, viewerFeedback: feedback[0]?.helpful ?? null };
}

async function getManagementArticle(user, id) {
  const policy = managementPolicy(user);
  const article = await prisma.knowledgeArticle.findFirst({ where: { AND: [policy, { id }] }, select: managementSelect });
  if (!article) throw new AppError('Knowledge article not found', 404);
  return article;
}

async function createArticle(user, input) {
  assertStaff(user);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = await uniqueSlug(input.title);
    try {
      return await prisma.knowledgeArticle.create({
        data: {
          title: input.title, slug, summary: input.summary || '', content: input.content || '',
          visibility: input.visibility || 'INTERNAL', ticketCategory: input.ticketCategory || 'OTHERS', tags: input.tags || [], authorId: user.id,
        },
        select: managementSelect,
      });
    } catch (error) {
      lastError = error;
      if (error.code !== 'P2002') throw error;
    }
  }
  throw lastError;
}

async function editArticle(user, id, input) {
  assertStaff(user);
  const where = { id, status: 'DRAFT', version: input.version, ...(user.role === 'AGENT' ? { authorId: user.id } : {}) };
  const { version, ...data } = input;
  const result = await prisma.knowledgeArticle.updateMany({ where, data: { ...data, version: { increment: 1 } } });
  if (!result.count) throw new AppError('Knowledge article was changed or is no longer editable', 409);
  return prisma.knowledgeArticle.findUnique({ where: { id }, select: managementSelect });
}

async function requiredCurrent(id, status, version, actor, ownerRequired = false) {
  const where = { id, status, version, ...(ownerRequired ? { authorId: actor.id } : {}) };
  const article = await prisma.knowledgeArticle.findFirst({ where, select: managementSelect });
  if (!article) throw new AppError('Knowledge article was changed or is no longer in the required state', 409);
  return article;
}

async function transitionArticle(user, id, { from, to, version, data = {}, eventType, requireComplete = false, targetStatus, requestId }) {
  assertRole(user);
  const isAgent = user.role === 'AGENT';
  if (isAgent && from !== 'DRAFT') throw new AppError('You do not have permission to perform this action', 403);
  if (!isAgent && user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  const current = await requiredCurrent(id, from, version, user, isAgent);
  if (requireComplete && incompleteArticle(current)) throw new AppError('Published articles require a meaningful summary and content', 422);
  const where = { id, status: from, version, ...(isAgent ? { authorId: user.id } : {}) };
  const transitionData = typeof data === 'function' ? data(current) : data;
  const nextData = { status: to, version: { increment: 1 }, ...transitionData };
  const auditMetadata = { fromStatus: from, toStatus: to, visibility: current.visibility, ticketCategory: current.ticketCategory, version: version + 1, ...(targetStatus && { targetStatus }) };
  return prisma.$transaction(async (tx) => {
    const result = await tx.knowledgeArticle.updateMany({ where, data: nextData });
    if (!result.count) throw new AppError('Knowledge article was changed or is no longer in the required state', 409);
    await tx.auditEvent.create({ data: { eventType, entityType: ARTICLE_ENTITY, entityId: id, actorUserId: user.id, requestId, metadata: auditMetadata } });
    return tx.knowledgeArticle.findUnique({ where: { id }, select: managementSelect });
  });
}

async function submitArticle(user, id, version, requestId) {
  return transitionArticle(user, id, { from: 'DRAFT', to: 'IN_REVIEW', version, data: { reviewNote: null }, eventType: 'knowledge_article.submitted', requestId });
}

async function publishArticle(user, id, version, requestId) {
  if (!user || user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  return transitionArticle(user, id, { from: 'IN_REVIEW', to: 'PUBLISHED', version, requireComplete: true, data: { reviewedById: user.id, publishedAt: new Date(), archivedAt: null }, eventType: 'knowledge_article.published', requestId });
}

async function returnToDraft(user, id, version, reviewNote, requestId) {
  if (!user || user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  return transitionArticle(user, id, { from: 'IN_REVIEW', to: 'DRAFT', version, data: { reviewNote }, eventType: 'knowledge_article.returned_to_draft', requestId });
}

async function archiveArticle(user, id, version, requestId) {
  if (!user || user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  return transitionArticle(user, id, { from: 'PUBLISHED', to: 'ARCHIVED', version, data: { archivedAt: new Date() }, eventType: 'knowledge_article.archived', requestId });
}

async function restoreArticle(user, id, version, targetStatus, requestId) {
  if (!user || user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  return transitionArticle(user, id, {
    from: 'ARCHIVED', to: targetStatus, version, requireComplete: targetStatus === 'PUBLISHED', targetStatus,
    data: targetStatus === 'PUBLISHED'
      ? (current) => ({ reviewedById: user.id, archivedAt: null, ...(current.publishedAt ? {} : { publishedAt: new Date() }) })
      : { archivedAt: null },
    eventType: 'knowledge_article.restored', requestId,
  });
}

async function voteFeedback(user, id, helpful) {
  assertRole(user);
  const article = await prisma.knowledgeArticle.findFirst({ where: readableWhere(user, { id }), select: { id: true } });
  if (!article) throw new AppError('Knowledge article not found', 404);
  return prisma.articleFeedback.upsert({ where: { articleId_userId: { articleId: id, userId: user.id } }, create: { articleId: id, userId: user.id, helpful }, update: { helpful }, select: { helpful: true, updatedAt: true } });
}

async function removeFeedback(user, id) {
  assertRole(user);
  const article = await prisma.knowledgeArticle.findFirst({ where: readableWhere(user, { id }), select: { id: true } });
  if (!article) throw new AppError('Knowledge article not found', 404);
  await prisma.articleFeedback.deleteMany({ where: { articleId: id, userId: user.id } });
}

async function feedbackSummary(user, id) {
  if (!user || user.role !== 'ADMIN') throw new AppError('You do not have permission to perform this action', 403);
  const article = await prisma.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
  if (!article) throw new AppError('Knowledge article not found', 404);
  const rows = await prisma.articleFeedback.groupBy({ by: ['helpful'], where: { articleId: id }, _count: { _all: true } });
  const helpful = rows.find((row) => row.helpful === true)?._count._all || 0;
  const notHelpful = rows.find((row) => row.helpful === false)?._count._all || 0;
  return { helpful, notHelpful, total: helpful + notHelpful };
}

module.exports = {
  ARTICLE_ENTITY, listSelect, managementListSelect, managementSelect, readPolicy, managementPolicy, readableWhere, listWhere, orderFor, incompleteArticle, slugBase,
  listArticles, listSuggestions, getArticleBySlug, getManagementArticle, createArticle, editArticle,
  submitArticle, publishArticle, returnToDraft, archiveArticle, restoreArticle, voteFeedback, removeFeedback, feedbackSummary,
};
