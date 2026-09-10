const prisma = require('../../config/prisma');
const { Prisma } = require('@prisma/client');
const AppError = require('../../utils/AppError');
const { normalizeFilters } = require('../reports/report.service');
const { feedbackSelect } = require('./satisfaction.service');

function reportScope(user, query = {}) {
  if (!['AGENT', 'ADMIN'].includes(user.role)) throw new AppError('Support reporting access required', 403);
  if (user.role === 'AGENT' && (query.agentId || query.department)) throw new AppError('Service-wide filters require Admin access', 403);
  const { range } = normalizeFilters(user, { from: query.from, to: query.to });
  const agentId = user.role === 'AGENT' ? user.id : query.agentId || null;
  const department = user.role === 'ADMIN' ? query.department || null : null;
  return { range, agentId, department, where: {
    submittedAt: { gte: range.from, lt: range.toExclusive },
    ...(query.rating ? { rating: query.rating } : {}),
    cycle: { ...(agentId ? { assignedAgentId: agentId } : {}), ...(department ? { departmentSnapshot: department } : {}) },
  } };
}

function aggregateResult(aggregate, groups) {
  return { average: aggregate._count._all ? Number(aggregate._avg.rating.toFixed(2)) : null,
    responses: aggregate._count._all,
    distribution: Object.fromEntries([1, 2, 3, 4, 5].map((rating) => [rating, groups.find((g) => g.rating === rating)?._count._all || 0])),
    responseRate: null, responseRateNote: 'Response rate is not reported; no historical invitation denominator is inferred.',
  };
}
async function report(user, query = {}, summaryOnly = false) {
  const { where, range, agentId, department } = reportScope(user, query);
  const { page = 1, limit = 10 } = query;
  return prisma.$transaction(async (tx) => {
    const [aggregate, groups] = await Promise.all([
      tx.ticketSatisfaction.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      tx.ticketSatisfaction.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    ]);
    const metrics = aggregateResult(aggregate, groups);
    if (summaryOnly) return { role: user.role, ...metrics, window: 'Last 30 days by submission date' };
    // Parameterized SQL aggregates in PostgreSQL instead of loading every
    // comment/response into memory to calculate the daily trend.
    const filters = [Prisma.sql`f."submittedAt" >= ${range.from}`, Prisma.sql`f."submittedAt" < ${range.toExclusive}`];
    if (agentId) filters.push(Prisma.sql`c."assignedAgentId" = ${agentId}`);
    if (department) filters.push(Prisma.sql`c."departmentSnapshot" = ${department}`);
    if (query.rating) filters.push(Prisma.sql`f."rating" = ${query.rating}`);
    const [feedback, trend] = await Promise.all([
      tx.ticketSatisfaction.findMany({ where, select: { ...feedbackSelect, cycle: { select: {
        number: true, ticketId: true, resolvedAt: true,
        ...(user.role === 'ADMIN' ? { departmentSnapshot: true, assignedAgent: { select: { id: true, name: true } } } : {}),
      } } }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      tx.$queryRaw(Prisma.sql`SELECT to_char(f."submittedAt", 'YYYY-MM-DD') AS day, AVG(f.rating)::float AS average, COUNT(*)::int AS responses FROM ticket_satisfactions f JOIN ticket_resolution_cycles c ON c.id = f."cycleId" WHERE ${Prisma.join(filters, ' AND ')} GROUP BY day ORDER BY day`),
    ]);
    return { role: user.role, ...metrics, feedback, trend, pagination: { page, limit, total: metrics.responses, totalPages: Math.ceil(metrics.responses / limit) }, dateBasis: 'Original submission date (UTC); edits retain that date.' };
  }, { isolationLevel: 'RepeatableRead' });
}
module.exports = { reportScope, aggregateResult, report };
