const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { ACTIVE_STATUSES, TICKET_STATUSES, TICKET_CATEGORIES, TICKET_PRIORITIES } = require('./report.definitions');

const MAX_RANGE_DAYS = 366;
const MAX_TREND_EVENTS = 10000;
const MAX_EXPORT_ROWS = 5000;
const RANGE_BOUNDARY = '[from 00:00:00.000Z, toExclusive 00:00:00.000Z)';

const ticketSelect = {
  id: true,
  title: true,
  status: true,
  category: true,
  priority: true,
  isWorkBlocking: true,
  createdAt: true,
  closedAt: true,
  assignedTo: { select: { id: true, name: true } },
};

function assertReportRole(user) {
  if (!user || !['AGENT', 'ADMIN'].includes(user.role)) {
    throw new AppError('You do not have permission to perform this action', 403);
  }
}

function utcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = utcDate(value);
  return !Number.isNaN(parsed.getTime()) && dateOnly(parsed) === value;
}

function addUtcDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeFilters(user, query = {}, generatedAt = new Date()) {
  assertReportRole(user);
  const today = new Date(Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate()));
  for (const value of [query.from, query.to]) {
    if (value && !isValidCalendarDate(value)) {
      throw new AppError('Dates must be valid YYYY-MM-DD UTC calendar dates', 422);
    }
  }
  const from = query.from ? utcDate(query.from) : addUtcDays(today, -29);
  const to = query.to ? utcDate(query.to) : today;
  const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || days < 1 || days > MAX_RANGE_DAYS) {
    throw new AppError(`Date range must be between 1 and ${MAX_RANGE_DAYS} inclusive UTC calendar days`, 422);
  }

  const filters = {
    from: dateOnly(from),
    to: dateOnly(to),
    interval: query.interval || 'day',
    ...(query.status && { status: query.status }),
    ...(query.category && { category: query.category }),
    ...(query.priority && { priority: query.priority }),
    workBlocking: query.workBlocking || 'all',
    ...(query.search && { search: query.search.trim() }),
  };
  if (user.role === 'ADMIN') {
    if (query.agentId) filters.agentId = query.agentId;
    if (query.department) filters.department = query.department.trim();
  }
  return {
    filters,
    range: { from, to, toExclusive: addUtcDays(to, 1), days },
  };
}

function dimensionalClauses(filters) {
  const clauses = [];
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.category) clauses.push({ category: filters.category });
  if (filters.priority) clauses.push({ priority: filters.priority });
  if (filters.workBlocking === 'yes') clauses.push({ isWorkBlocking: true });
  if (filters.workBlocking === 'no') clauses.push({ isWorkBlocking: false });
  if (filters.search) clauses.push({ title: { contains: filters.search, mode: 'insensitive' } });
  if (filters.agentId) clauses.push({ assignedToId: filters.agentId });
  if (filters.department) clauses.push({ createdBy: { department: filters.department } });
  return clauses;
}

function ticketWhere(user, filters, range, includePeriod = true) {
  const clauses = [
    user.role === 'AGENT' ? { assignedToId: user.id } : {},
    ...dimensionalClauses(filters),
  ];
  if (includePeriod) clauses.push({ createdAt: { gte: range.from, lt: range.toExclusive } });
  return { AND: clauses };
}

function activeTicketWhere(user, filters, range) {
  return { AND: [...ticketWhere(user, filters, range, false).AND, { status: { in: ACTIVE_STATUSES } }] };
}

function closedTicketWhere(user, filters, range) {
  return {
    AND: [
      ...ticketWhere(user, filters, range, false).AND,
      { status: 'CLOSED' },
      { closedAt: { gte: range.from, lt: range.toExclusive } },
    ],
  };
}

function historyWhere(user, filters, range, extra = {}) {
  const ticketClauses = dimensionalClauses(filters);
  return {
    AND: [
      { createdAt: { gte: range.from, lt: range.toExclusive } },
      ...Object.entries(extra).map(([key, value]) => ({ [key]: value })),
      ...(ticketClauses.length ? [{ ticket: { AND: ticketClauses } }] : []),
    ],
  };
}

function historyMetadataWhere(baseWhere, metadataClauses) {
  return { AND: [...baseWhere.AND, ...metadataClauses] };
}

function reopenHistoryWhere(baseWhere) {
  const toOpen = { metadata: { path: ['to'], equals: 'OPEN' } };
  return {
    OR: [
      { AND: [...baseWhere.AND, toOpen, { metadata: { path: ['from'], equals: 'RESOLVED' } }] },
      { AND: [...baseWhere.AND, toOpen, { metadata: { path: ['from'], equals: 'CLOSED' } }] },
    ],
  };
}

function zeroCounts(values, rows, key) {
  const counts = Object.fromEntries(values.map((value) => [value, 0]));
  for (const row of rows) counts[row[key]] = row._count._all;
  return counts;
}

function envelope(user, generatedAt, filters, range, body) {
  return {
    role: user.role,
    generatedAt: generatedAt.toISOString(),
    timezone: 'UTC',
    filters,
    range: {
      from: filters.from,
      to: filters.to,
      toExclusive: dateOnly(range.toExclusive),
      days: range.days,
      boundary: RANGE_BOUNDARY,
    },
    ...body,
  };
}

function bucketStart(date, interval) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (interval === 'week') result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  if (interval === 'month') result.setUTCDate(1);
  return dateOnly(result);
}

function trendPoints(range, interval, eventGroups) {
  const keys = [];
  const current = new Date(range.from.getTime());
  if (interval === 'week') current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
  if (interval === 'month') current.setUTCDate(1);
  while (current < range.toExclusive) {
    keys.push(dateOnly(current));
    if (interval === 'day') current.setUTCDate(current.getUTCDate() + 1);
    if (interval === 'week') current.setUTCDate(current.getUTCDate() + 7);
    if (interval === 'month') current.setUTCMonth(current.getUTCMonth() + 1, 1);
  }
  const counts = new Map(keys.map((key) => [key, Object.fromEntries(eventGroups.map(({ name }) => [name, 0]))]));
  for (const { name, rows, dateField = 'createdAt' } of eventGroups) {
    for (const row of rows) {
      const key = bucketStart(new Date(row[dateField]), interval);
      if (counts.has(key)) counts.get(key)[name] += 1;
    }
  }
  return keys.map((periodStart) => ({ periodStart, ...counts.get(periodStart) }));
}

async function boundedHistory(where, select, message = 'Report history exceeds the event safety limit. Narrow the date range or filters.') {
  const rows = await prisma.ticketHistory.findMany({ where, select, orderBy: { createdAt: 'asc' }, take: MAX_TREND_EVENTS + 1 });
  if (rows.length > MAX_TREND_EVENTS) throw new AppError(message, 413);
  return rows;
}

async function boundedTicketEvents(where, field) {
  const rows = await prisma.ticket.findMany({ where, select: { [field]: true }, orderBy: { [field]: 'asc' }, take: MAX_TREND_EVENTS + 1 });
  if (rows.length > MAX_TREND_EVENTS) throw new AppError('Report trend data exceeds the event safety limit. Narrow the date range or filters.', 413);
  return rows;
}

function isResolution(metadata) {
  return metadata && metadata.to === 'RESOLVED';
}

function isReopen(metadata) {
  return metadata && metadata.to === 'OPEN' && ['RESOLVED', 'CLOSED'].includes(metadata.from);
}

async function getAgentSummary(user, filters, range, generatedAt) {
  const createdWhere = ticketWhere(user, filters, range);
  const activeWhere = activeTicketWhere(user, filters, range);
  const statusHistoryWhere = historyWhere(user, filters, range, { action: 'STATUS_CHANGED', userId: user.id });
  const resolutionHistoryWhere = historyMetadataWhere(statusHistoryWhere, [{ metadata: { path: ['to'], equals: 'RESOLVED' } }]);
  const reopenWhere = reopenHistoryWhere(statusHistoryWhere);
  const assignedDuringWhere = historyWhere(user, filters, range, {
    action: 'ASSIGNED',
    metadata: { path: ['to'], equals: user.id },
  });

  const [activeAssigned, workBlockingActive, assignedDuring, byStatus, byCategory, resolvedEvents, reopenedEvents] = await Promise.all([
    prisma.ticket.count({ where: activeWhere }),
    prisma.ticket.count({ where: { AND: [...activeWhere.AND, { isWorkBlocking: true }] } }),
    prisma.ticketHistory.count({ where: assignedDuringWhere }),
    prisma.ticket.groupBy({ by: ['status'], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['category'], where: createdWhere, _count: { _all: true } }),
    boundedHistory(resolutionHistoryWhere, { createdAt: true, metadata: true }),
    boundedHistory(reopenWhere, { createdAt: true, metadata: true }),
  ]);
  const resolved = resolvedEvents.filter((event) => isResolution(event.metadata));
  const reopened = reopenedEvents.filter((event) => isReopen(event.metadata)).length;
  return envelope(user, generatedAt, filters, range, {
    metrics: { assignedDuring, resolvedByMe: resolved.length, activeAssigned, workBlockingActive, reopened, averageResolutionHours: null },
    metricNotes: {
      assignedDuring: 'ASSIGNED history events whose metadata.to is the authenticated Agent in the selected period.',
      resolvedByMe: 'STATUS_CHANGED history events to RESOLVED performed by the authenticated Agent in the selected period.',
      activeAssigned: 'Current OPEN, IN_PROGRESS, and PENDING tickets assigned to this Agent after non-date filters.',
      reopened: 'STATUS_CHANGED events to OPEN from RESOLVED or CLOSED performed by this Agent in the selected period.',
      averageResolutionHours: 'Unsupported: the model has no dedicated stable resolvedAt timestamp, so updatedAt is not used as a substitute.',
    },
    trends: { interval: filters.interval, points: trendPoints(range, filters.interval, [{ name: 'resolved', rows: resolved }]) },
    distributions: {
      byStatus: zeroCounts(TICKET_STATUSES, byStatus, 'status'),
      byCategory: zeroCounts(TICKET_CATEGORIES, byCategory, 'category'),
    },
  });
}

function mapDepartmentCounts(rows, users) {
  const departments = new Map(users.map((user) => [user.id, user.department]));
  const counts = { Unknown: 0 };
  for (const row of rows) {
    const department = departments.get(row.createdById) || 'Unknown';
    counts[department] = (counts[department] || 0) + row._count._all;
  }
  return counts;
}

function activeWorkload(rows, agents) {
  const workloads = new Map();
  for (const row of rows) {
    if (!row.assignedToId) continue;
    const workload = workloads.get(row.assignedToId) || { total: 0, byStatus: Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])) };
    workload.total += row._count._all;
    workload.byStatus[row.status] = row._count._all;
    workloads.set(row.assignedToId, workload);
  }
  return agents.map(({ id, name, role, isActive }) => ({
    id, name, role, isActive,
    ...(workloads.get(id) || { total: 0, byStatus: Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])) }),
  }));
}

async function getAdminSummary(user, filters, range, generatedAt) {
  const createdWhere = ticketWhere(user, filters, range);
  const activeWhere = activeTicketWhere(user, filters, range);
  const closedWhere = closedTicketWhere(user, filters, range);
  const history = historyWhere(user, filters, range, { action: 'STATUS_CHANGED' });
  const resolutionHistoryWhere = historyMetadataWhere(history, [{ metadata: { path: ['to'], equals: 'RESOLVED' } }]);
  const reopenWhere = reopenHistoryWhere(history);
  const [created, closed, active, workBlocking, unassignedActive, byStatus, byCategory, byPriority, byRequester, activeCounts, agents, departments, resolutionEvents, reopenedEvents, createdEvents, closedEvents] = await Promise.all([
    prisma.ticket.count({ where: createdWhere }),
    prisma.ticket.count({ where: closedWhere }),
    prisma.ticket.count({ where: activeWhere }),
    prisma.ticket.count({ where: { AND: [...createdWhere.AND, { isWorkBlocking: true }] } }),
    prisma.ticket.count({ where: { AND: [...activeWhere.AND, { assignedToId: null }] } }),
    prisma.ticket.groupBy({ by: ['status'], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['category'], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['createdById'], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['assignedToId', 'status'], where: activeWhere, _count: { _all: true } }),
    prisma.user.findMany({ where: { role: 'AGENT', isActive: true }, select: { id: true, name: true, role: true, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { department: { not: null } }, select: { department: true }, distinct: ['department'], orderBy: { department: 'asc' } }),
    boundedHistory(resolutionHistoryWhere, { createdAt: true, metadata: true, user: { select: { id: true, name: true, role: true, isActive: true } } }),
    boundedHistory(reopenWhere, { createdAt: true, metadata: true }),
    boundedTicketEvents(createdWhere, 'createdAt'),
    boundedTicketEvents(closedWhere, 'closedAt'),
  ]);
  const requesterIds = byRequester.map((row) => row.createdById);
  const requesters = requesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, department: true } })
    : [];
  const resolvedEvents = resolutionEvents.filter((event) => isResolution(event.metadata) && event.user?.role === 'AGENT');
  const activities = new Map();
  for (const event of resolvedEvents) {
    const actor = event.user;
    if (!actor || actor.role !== 'AGENT') continue;
    const existing = activities.get(actor.id) || { id: actor.id, name: actor.name, isActive: actor.isActive, role: actor.role, count: 0 };
    existing.count += 1;
    activities.set(actor.id, existing);
  }
  return envelope(user, generatedAt, filters, range, {
    metrics: {
      created, closed, active, workBlocking, reopened: reopenedEvents.filter((event) => isReopen(event.metadata)).length,
      unassignedActive, averageResolutionHours: null,
    },
    metricNotes: {
      created: 'Tickets created in the selected period using ticket.createdAt.',
      closed: 'Tickets currently CLOSED whose closedAt is in the selected period.',
      active: 'Current OPEN, IN_PROGRESS, and PENDING ticket snapshot after non-date filters.',
      workBlocking: 'Tickets created in the selected period that are currently marked work-blocking.',
      reopened: 'Reliable STATUS_CHANGED history events to OPEN from RESOLVED or CLOSED in the selected period.',
      averageResolutionHours: 'Unsupported: the model has no dedicated stable resolvedAt timestamp, so updatedAt is not used as a substitute.',
    },
    trends: {
      interval: filters.interval,
      points: trendPoints(range, filters.interval, [
        { name: 'created', rows: createdEvents },
        { name: 'closed', rows: closedEvents, dateField: 'closedAt' },
      ]),
    },
    distributions: {
      byStatus: zeroCounts(TICKET_STATUSES, byStatus, 'status'),
      byCategory: zeroCounts(TICKET_CATEGORIES, byCategory, 'category'),
      byPriority: zeroCounts(TICKET_PRIORITIES, byPriority, 'priority'),
      byDepartment: mapDepartmentCounts(byRequester, requesters),
    },
    agentActivity: {
      currentWorkload: activeWorkload(activeCounts, agents),
      resolutionActivity: [...activities.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
    filterOptions: {
      agents: agents.map(({ id, name }) => ({ id, name })),
      departments: [...new Set(departments.map((row) => row.department && row.department.trim()).filter(Boolean))],
    },
  });
}

async function getSummary(user, query) {
  const generatedAt = new Date();
  const { filters, range } = normalizeFilters(user, query, generatedAt);
  return user.role === 'ADMIN'
    ? getAdminSummary(user, filters, range, generatedAt)
    : getAgentSummary(user, filters, range, generatedAt);
}

function ticketRowSelect(role) {
  return role === 'ADMIN'
    ? { ...ticketSelect, createdBy: { select: { department: true } } }
    : ticketSelect;
}

function mapTicket(row, role) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    category: row.category,
    priority: row.priority,
    isWorkBlocking: row.isWorkBlocking,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    assignedAgent: row.assignedTo ? { id: row.assignedTo.id, name: row.assignedTo.name } : null,
    ...(role === 'ADMIN' && { requesterDepartment: row.createdBy?.department || 'Unknown' }),
  };
}

function ticketOrder(sortOrder) {
  return [{ createdAt: sortOrder }, { id: sortOrder }];
}

async function listTickets(user, query) {
  const generatedAt = new Date();
  const { filters, range } = normalizeFilters(user, query, generatedAt);
  const where = ticketWhere(user, filters, range);
  const page = query.page || 1;
  const limit = query.limit || 20;
  const sortOrder = query.sortOrder || 'desc';
  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({ where, select: ticketRowSelect(user.role), orderBy: ticketOrder(sortOrder), skip: (page - 1) * limit, take: limit }),
    prisma.ticket.count({ where }),
  ]);
  return envelope(user, generatedAt, filters, range, {
    rows: rows.map((row) => mapTicket(row, user.role)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sortOrder,
    },
  });
}

function sanitizeCsvText(value) {
  const clean = String(value == null ? '' : value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return /^[\t\r\n ]*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

function csvCell(value) {
  return `"${sanitizeCsvText(value).replace(/"/g, '""')}"`;
}

function toCsv(rows, role) {
  const headers = role === 'ADMIN'
    ? ['Ticket ID', 'Title', 'Status', 'Category', 'Priority', 'Work Blocking', 'Created At UTC', 'Closed At UTC', 'Requester Department', 'Assigned Agent']
    : ['Ticket ID', 'Title', 'Status', 'Category', 'Priority', 'Work Blocking', 'Created At UTC', 'Closed At UTC'];
  const records = rows.map((row) => {
    const cells = [row.id, row.title, row.status, row.category, row.priority, row.isWorkBlocking ? 'Yes' : 'No', row.createdAt.toISOString(), row.closedAt ? row.closedAt.toISOString() : ''];
    if (role === 'ADMIN') cells.push(row.createdBy?.department || 'Unknown', row.assignedTo?.name || '');
    return cells.map(csvCell).join(',');
  });
  return `\uFEFF${headers.map(csvCell).join(',')}\r\n${records.join('\r\n')}${records.length ? '\r\n' : ''}`;
}

function auditFilters(filters) {
  const { search, ...safe } = filters;
  return safe;
}

async function exportTickets(user, query) {
  const generatedAt = new Date();
  const { filters, range } = normalizeFilters(user, query, generatedAt);
  const where = ticketWhere(user, filters, range);
  const total = await prisma.ticket.count({ where });
  if (total > MAX_EXPORT_ROWS) throw new AppError(`Export is limited to ${MAX_EXPORT_ROWS.toLocaleString()} rows. Narrow the date range or filters and try again.`, 413);
  const rows = await prisma.ticket.findMany({ where, select: ticketRowSelect(user.role), orderBy: ticketOrder(query.sortOrder || 'desc'), take: MAX_EXPORT_ROWS });
  const prefix = user.role === 'ADMIN' ? 'service-desk-reports' : 'my-reports';
  return {
    csv: toCsv(rows, user.role),
    filename: `${prefix}-${filters.from}-to-${filters.to}.csv`,
    auditMetadata: { role: user.role, filters: auditFilters(filters), range: { from: filters.from, to: filters.to }, rowCount: rows.length },
  };
}

module.exports = {
  getSummary,
  listTickets,
  exportTickets,
  normalizeFilters,
  ticketWhere,
  activeTicketWhere,
  closedTicketWhere,
  historyWhere,
  sanitizeCsvText,
  toCsv,
  MAX_EXPORT_ROWS,
};
