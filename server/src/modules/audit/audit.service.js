const prisma = require('../../config/prisma');

// Audit writes never include request bodies or private content. A temporary
// database outage must not convert an otherwise successful ticket operation
// into a failed client request; the error is logged with its correlation ID.
function recordAudit({ eventType, entityType, entityId, actorUserId, requestId, metadata }) {
  return Promise.resolve()
    .then(() => prisma.auditEvent.create({
      data: { eventType, entityType, entityId, actorUserId, requestId, metadata },
    }))
    .catch((error) => console.error(`Audit write failed req=${requestId || 'unknown'}`, error.message));
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
