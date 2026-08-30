const prisma = require('../../config/prisma');

// Dashboard visibility is intentionally stricter than the ticket-list
// visibility filter (ticket.service.js) for Agents: the ticket list still
// shows unassigned tickets so an agent can pick up work, but the Agent
// Dashboard should reflect only *their own* workload — tickets actually
// assigned to them.
function buildDashboardFilter(user) {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'AGENT') return { assignedToId: user.id };
  return { createdById: user.id };
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
            ...(user.role === 'AGENT'
              ? { ticket: { OR: [{ assignedToId: user.id }, { assignedToId: null }] } }
              : {}),
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
        where: { assignedToId: agent.id },
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

module.exports = { getStats, getAgentWorkload };
