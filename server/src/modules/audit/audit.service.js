const prisma = require('../../config/prisma');

// Audit writes never include request bodies or private content. A temporary
// database outage must not convert an otherwise successful ticket operation
// into a failed client request; only a static operational failure is logged.
function recordAudit({ eventType, entityType, entityId, actorUserId, requestId, metadata }) {
  return Promise.resolve()
    .then(() => prisma.auditEvent.create({
      data: { eventType, entityType, entityId, actorUserId, requestId, metadata },
    }))
    .catch(() => console.error('Audit write failed (details redacted)'));
}

async function listAuditEvents({ page, limit, eventType }) {
  const where = eventType ? { eventType } : {};
  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditEvent.count({ where }),
  ]);
  return { events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = { recordAudit, listAuditEvents };
