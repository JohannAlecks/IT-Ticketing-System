const prisma = require('../../config/prisma');
const { departmentSelect, departmentName } = require('../departments/department.projection');
const AppError = require('../../utils/AppError');
const authorize = require('../../middleware/authorize');
const { buildTicketVisibilityFilter } = require('../tickets/ticket.access');
const { readPolicy } = require('../knowledge/knowledge.service');
const { TicketCategory, TicketStatus, Role } = require('@prisma/client');
const directoryAccess = authorize('ADMIN');
// LIKE metacharacters are literal search characters, not wildcard controls.
const literal = (q) => q.replace(/[\\%_]/g, '\\$&');
const contains = (q) => ({ contains: literal(q), mode: 'insensitive' });
const enums = (values, q) => Object.values(values).filter((v) => v.replaceAll('_', ' ').toLowerCase().includes(q.replaceAll('_', ' ').toLowerCase()));
const text = (value, max = 200) => String(value || '').replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
const personName = { select: { name: true } };
const ticketSelect = { id: true, title: true, status: true, category: true, archivedAt: true, updatedAt: true, createdBy: personName, assignedTo: personName };
const knowledgeSelect = { id: true, slug: true, title: true, summary: true, ticketCategory: true, publishedAt: true, updatedAt: true };
const userSelect = { id: true, name: true, email: true, ...departmentSelect, role: true, isActive: true, updatedAt: true };
function ticketWhere(user, { q, includeArchived }) {
  const identifier = q.replace(/^#/, '');
  return { AND: [buildTicketVisibilityFilter(user), includeArchived ? {} : { archivedAt: null }, { OR: [
    { title: contains(q) },
    ...(/^[a-f\d-]{2,36}$/i.test(identifier) ? [{ id: { startsWith: literal(identifier), mode: 'insensitive' } }] : []),
    { category: { in: enums(TicketCategory, q) } }, { status: { in: enums(TicketStatus, q) } },
    { createdBy: { name: contains(q) } }, { assignedTo: { name: contains(q) } },
  ] }] };
}
function knowledgeWhere(user, { q }) {
  return { AND: [readPolicy(user), { status: 'PUBLISHED', archivedAt: null }, { OR: [
    { title: contains(q) }, { summary: contains(q) }, { tags: { has: q.toLowerCase() } }, { ticketCategory: { in: enums(TicketCategory, q) } },
  ] }] };
}
function userWhere(user, { q }) {
  directoryAccess({ user }, null, () => {});
  const status = q.toLowerCase();
  return { OR: [{ name: contains(q) }, { email: contains(q) }, { departmentRecord: { name: contains(q) } }, { departmentId: null, department: contains(q) }, { role: { in: enums(Role, q) } },
    ...(['active', 'inactive'].includes(status) ? [{ isActive: status === 'active' }] : [])] };
}
const ticketResult = (row) => ({ id: row.id, type: 'ticket', title: text(row.title),
  subtitle: [row.createdBy?.name && `Requester: ${text(row.createdBy.name, 80)}`, row.assignedTo?.name && `Assigned: ${text(row.assignedTo.name, 80)}`].filter(Boolean).join(' · '),
  path: `/tickets/${encodeURIComponent(row.id)}`, updatedAt: row.updatedAt,
  metadata: { ticketNumber: `#${row.id.slice(0, 8)}`, status: row.status, category: row.category, archived: Boolean(row.archivedAt) } });
const knowledgeResult = (row) => ({ id: row.id, type: 'knowledge', title: text(row.title), subtitle: text(row.summary, 180),
  path: `/knowledge/${encodeURIComponent(row.slug)}`, updatedAt: row.updatedAt,
  metadata: { category: row.ticketCategory, publishedAt: row.publishedAt, published: true } });
const userResult = (row) => ({ id: row.id, type: 'user', title: text(row.name, 100), subtitle: text(row.email, 254),
  path: `/users?status=ALL#user-${encodeURIComponent(row.id)}`, updatedAt: row.updatedAt,
  metadata: { department: text(departmentName(row), 100), role: row.role, active: row.isActive } });
async function search(user, query, mode = 'quick') {
  try {
    // Do not trust a token's role, previous response, or caller-supplied account.
    const current = user?.id && await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isActive: true, emailVerified: true } });
    if (!current?.isActive || !current.emailVerified || !Object.values(Role).includes(current.role)) throw new AppError('Authentication required', 401);
    if (query.type === 'users') directoryAccess({ user: current }, null, () => {});
    const page = mode === 'quick' ? 1 : query.page;
    const size = mode === 'quick' ? query.limit : query.pageSize;
    const definitions = [
      ['tickets', prisma.ticket, ticketWhere, ticketSelect, ticketResult],
      ['knowledge', prisma.knowledgeArticle, knowledgeWhere, knowledgeSelect, knowledgeResult],
      ...(current.role === 'ADMIN' ? [['users', prisma.user, userWhere, userSelect, userResult]] : []),
    ].filter(([key]) => query.type === 'all' || query.type === key);
    const groups = await Promise.all(definitions.map(async ([type, model, where, select, map]) => {
      const rows = await model.findMany({ where: where(current, query), select, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * size, take: size + 1 });
      return { type, results: rows.slice(0, size).map(map), hasMore: rows.length > size };
    }));
    return { groups, page, pageSize: size };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Never forward query input, SQL, Prisma validation details or result data.
    throw new AppError('Search is temporarily unavailable. Please try again.', 503);
  }
}
module.exports = { search, ticketWhere, knowledgeWhere, userWhere, ticketSelect, knowledgeSelect, userSelect, literal };
