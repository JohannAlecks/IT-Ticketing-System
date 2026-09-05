const prisma = require('../../config/prisma');
const env = require('../../config/env');

const WINDOW_DAYS = 7;
const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING'];
const TERMINAL_STATUSES = ['RESOLVED', 'CLOSED'];
const TICKET_STATUSES = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];
const TICKET_CATEGORIES = [
  'INTERNET_NETWORK', 'VPN', 'PC_LAPTOP', 'PRINTER_SCANNER',
  'ACCOUNTS_ACCESS', 'EMAIL', 'SOFTWARE_APPLICATION', 'SERVER_SYSTEM',
  'REQUESTS', 'SECURITY', 'OTHERS',
];

const ticketListSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  assignedTo: { select: { id: true, name: true } },
};

function statusCounts(rows) {
  const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

function categoryCounts(rows) {
  const counts = Object.fromEntries(TICKET_CATEGORIES.map((category) => [category, 0]));
  for (const row of rows) counts[row.category] = row._count._all;
  return counts;
}

function onboardingDefaults(onboarding) {
  return {
    completedSteps: Array.isArray(onboarding?.completedSteps) ? onboarding.completedSteps : [],
    dismissedAt: onboarding?.dismissedAt || null,
    completedAt: onboarding?.completedAt || null,
  };
}

function summaryEnvelope(user, generatedAt, onboarding, body) {
  return {
    role: user.role,
    generatedAt: generatedAt.toISOString(),
    windowDays: WINDOW_DAYS,
    definitions: { activeStatuses: ACTIVE_STATUSES, terminalStatuses: TERMINAL_STATUSES },
    ...body,
    onboarding: onboardingDefaults(onboarding),
  };
}

function activeWhere(extra = {}) {
  return { archivedAt: null, status: { in: ACTIVE_STATUSES }, ...extra };
}

function closedWithin(cutoff, extra = {}) {
  return { archivedAt: null, status: 'CLOSED', closedAt: { gte: cutoff }, ...extra };
}

async function getUserSummary(user, cutoff, generatedAt) {
  const own = { createdById: user.id, archivedAt: null };
  const [active, workBlocking, recentlyCreated, recentlyClosed, byStatus, activeTickets, recentTickets, recentClosedTickets, onboarding] = await Promise.all([
    prisma.ticket.count({ where: activeWhere(own) }),
    prisma.ticket.count({ where: activeWhere({ ...own, isWorkBlocking: true }) }),
    prisma.ticket.count({ where: { ...own, createdAt: { gte: cutoff } } }),
    prisma.ticket.count({ where: closedWithin(cutoff, own) }),
    prisma.ticket.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
    prisma.ticket.findMany({ where: activeWhere(own), select: ticketListSelect, orderBy: [{ isWorkBlocking: 'desc' }, { updatedAt: 'desc' }], take: 6 }),
    prisma.ticket.findMany({ where: { ...own, updatedAt: { gte: cutoff } }, select: ticketListSelect, orderBy: { updatedAt: 'desc' }, take: 6 }),
    prisma.ticket.findMany({ where: closedWithin(cutoff, own), select: ticketListSelect, orderBy: { closedAt: 'desc' }, take: 6 }),
    prisma.userOnboarding.findUnique({ where: { userId: user.id }, select: { completedSteps: true, dismissedAt: true, completedAt: true } }),
  ]);

  return summaryEnvelope(user, generatedAt, onboarding, {
    metrics: { active, workBlocking, recentlyCreated, recentlyClosed },
    distributions: { byStatus: statusCounts(byStatus) },
    lists: { active: activeTickets, recent: recentTickets, recentClosed: recentClosedTickets },
  });
}

async function getAgentSummary(user, cutoff, generatedAt) {
  const assigned = { assignedToId: user.id, archivedAt: null };
  const unassigned = { assignedToId: null, archivedAt: null };
  const [assignedActive, assignedWorkBlocking, eligibleUnassigned, recentlyUpdatedAssigned, recentlyClosedByMe, byStatus, priorityQueue, unassignedTickets, recentlyUpdated, onboarding] = await Promise.all([
    prisma.ticket.count({ where: activeWhere(assigned) }),
    prisma.ticket.count({ where: activeWhere({ ...assigned, isWorkBlocking: true }) }),
    prisma.ticket.count({ where: activeWhere(unassigned) }),
    prisma.ticket.count({ where: { ...assigned, updatedAt: { gte: cutoff } } }),
    prisma.ticket.count({ where: closedWithin(cutoff, assigned) }),
    prisma.ticket.groupBy({ by: ['status'], where: assigned, _count: { _all: true } }),
    prisma.ticket.findMany({ where: activeWhere(assigned), select: ticketListSelect, orderBy: [{ isWorkBlocking: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }], take: 6 }),
    prisma.ticket.findMany({ where: activeWhere(unassigned), select: ticketListSelect, orderBy: [{ isWorkBlocking: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }], take: 6 }),
    prisma.ticket.findMany({ where: { ...assigned, updatedAt: { gte: cutoff } }, select: ticketListSelect, orderBy: { updatedAt: 'desc' }, take: 6 }),
    prisma.userOnboarding.findUnique({ where: { userId: user.id }, select: { completedSteps: true, dismissedAt: true, completedAt: true } }),
  ]);

  return summaryEnvelope(user, generatedAt, onboarding, {
    metrics: { assignedActive, assignedWorkBlocking, eligibleUnassigned, recentlyUpdatedAssigned, recentlyClosedByMe },
    distributions: { byStatus: statusCounts(byStatus) },
    lists: { priorityQueue, unassigned: unassignedTickets, recentlyUpdated },
  });
}

async function getAdminSummary(user, cutoff, generatedAt) {
  const [totalTickets, activeTickets, unassignedActive, workBlockingActive, recentlyCreated, recentlyClosed, activeAgents, inactiveUsers, byStatus, byCategory, requesterVolumes, activeTicketCounts, priorityQueue, recentAudit, onboarding] = await Promise.all([
    prisma.ticket.count({ where: { archivedAt: null } }),
    prisma.ticket.count({ where: activeWhere() }),
    prisma.ticket.count({ where: activeWhere({ assignedToId: null }) }),
    prisma.ticket.count({ where: activeWhere({ isWorkBlocking: true }) }),
    prisma.ticket.count({ where: { archivedAt: null, createdAt: { gte: cutoff } } }),
    prisma.ticket.count({ where: closedWithin(cutoff) }),
    prisma.user.count({ where: { role: 'AGENT', isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.ticket.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['category'], where: { archivedAt: null }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['createdById'], where: { archivedAt: null }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['assignedToId', 'status'], where: activeWhere(), _count: { _all: true } }),
    prisma.ticket.findMany({ where: activeWhere(), select: ticketListSelect, orderBy: [{ isWorkBlocking: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }], take: 8 }),
    prisma.auditEvent.findMany({ select: { id: true, eventType: true, entityType: true, entityId: true, createdAt: true, actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.userOnboarding.findUnique({ where: { userId: user.id }, select: { completedSteps: true, dismissedAt: true, completedAt: true } }),
  ]);

  const requesterIds = requesterVolumes.map((row) => row.createdById);
  // One batched user lookup supplies both requester departments and the
  // active-agent roster, avoiding a per-requester lookup and keeping the
  // workload query independent of inactive agents.
  const relatedUsers = await prisma.user.findMany({
    where: { OR: [{ id: { in: requesterIds } }, { role: 'AGENT', isActive: true }] },
    select: { id: true, name: true, department: true, role: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  const departmentsByUserId = new Map(relatedUsers.map((requester) => [requester.id, requester.department]));
  const agents = relatedUsers
    .filter((candidate) => candidate.role === 'AGENT' && candidate.isActive)
    .map(({ id, name }) => ({ id, name }));
  const byDepartment = { Unknown: 0 };
  for (const row of requesterVolumes) {
    const department = departmentsByUserId.get(row.createdById) || 'Unknown';
    byDepartment[department] = (byDepartment[department] || 0) + row._count._all;
  }
  const workloadByAgentId = new Map();
  for (const row of activeTicketCounts) {
    if (!row.assignedToId) continue;
    const workload = workloadByAgentId.get(row.assignedToId) || {
      total: 0,
      byStatus: Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])),
    };
    workload.total += row._count._all;
    workload.byStatus[row.status] = row._count._all;
    workloadByAgentId.set(row.assignedToId, workload);
  }

  return summaryEnvelope(user, generatedAt, onboarding, {
    metrics: { totalTickets, activeTickets, unassignedActive, workBlockingActive, recentlyCreated, recentlyClosed, activeAgents, inactiveUsers },
    distributions: { byStatus: statusCounts(byStatus), byCategory: categoryCounts(byCategory), byDepartment },
    lists: {
      workload: agents.map((agent) => ({
        agent,
        ...(workloadByAgentId.get(agent.id) || {
          total: 0,
          byStatus: Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])),
        }),
      })),
      priorityQueue,
      recentAudit,
    },
    operations: { emailDeliveryConfigured: env.EMAIL_PROVIDER === 'resend' },
  });
}

async function getSummary(user) {
  const generatedAt = new Date();
  const cutoff = new Date(generatedAt.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (user.role === 'ADMIN') return getAdminSummary(user, cutoff, generatedAt);
  if (user.role === 'AGENT') return getAgentSummary(user, cutoff, generatedAt);
  return getUserSummary(user, cutoff, generatedAt);
}

// Dashboard visibility is intentionally stricter than the ticket-list
// visibility filter (ticket.service.js) for Agents: the ticket list still
// shows unassigned tickets so an agent can pick up work, but the Agent
// Dashboard should reflect only *their own* workload — tickets actually
// assigned to them.
function buildDashboardFilter(user) {
  if (user.role === 'ADMIN') return { archivedAt: null };
  if (user.role === 'AGENT') return { assignedToId: user.id, archivedAt: null };
  return { createdById: user.id, archivedAt: null };
}

async function getStats(user) {
  const where = buildDashboardFilter(user);
  const recentActivityWhere = {
    ticket: where,
    ...(user.role === 'USER'
      ? { NOT: { description: { contains: 'internal note' } } }
      : {}),
  };

  const [total, byStatus, byPriority, recentActivity, myActivity] = await Promise.all([
    prisma.ticket.count({ where }),

    prisma.ticket.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),

    prisma.ticket.groupBy({
      by: ['priority'],
      where,
      _count: { _all: true },
    }),

    // Org/ticket-scoped feed (used as-is for Admin; for User/Agent it's
    // scoped by the `where` filter via the ticket relation). USER feeds also
    // exclude internal-note history, matching the ticket detail response.
    prisma.ticketHistory.findMany({
      where: recentActivityWhere,
      include: {
        user: { select: { id: true, name: true } },
        ticket: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    // Actor-scoped feed: "things I personally did" — only meaningful for
    // Agent/Admin. Agent rows still obey the queue/assignment visibility
    // policy so past activity cannot reveal a ticket now owned by someone
    // else. Omitted (null) for USER to avoid a redundant duplicate of
    // recentActivity.
    user.role === 'AGENT' || user.role === 'ADMIN'
      ? prisma.ticketHistory.findMany({
          where: {
            userId: user.id,
            ticket: user.role === 'AGENT'
              ? { AND: [{ archivedAt: null }, { OR: [{ assignedToId: user.id }, { assignedToId: null }] }] }
              : { archivedAt: null },
          },
          include: { ticket: { select: { id: true, title: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : Promise.resolve(null),
  ]);

  const statusCounts = byStatus.reduce((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
  const priorityCounts = byPriority.reduce((acc, row) => {
    acc[row.priority] = row._count._all;
    return acc;
  }, {});

  return {
    total,
    byStatus: statusCounts,
    byPriority: priorityCounts,
    recentActivity,
    myActivity,
  };
}

// Admin-only: how many tickets each agent currently carries, broken down
// by status. Built from the same Ticket/User tables — no new model needed.
async function getAgentWorkload() {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  const workload = await Promise.all(
    agents.map(async (agent) => {
      const byStatus = await prisma.ticket.groupBy({
        by: ['status'],
        where: { assignedToId: agent.id, archivedAt: null },
        _count: { _all: true },
      });
      const statusCounts = byStatus.reduce((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {});
      const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
      return { agent, total, byStatus: statusCounts };
    })
  );

  return workload;
}

module.exports = { getStats, getAgentWorkload, getSummary };
