const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { TIME_MODEL } = require('./sla.engine');

const policySelect = { id: true, name: true, priority: true, firstResponseMinutes: true, resolutionMinutes: true, dueSoonMinutes: true, isActive: true, version: true };

async function listPolicies() {
  const policies = await prisma.slaPolicy.findMany({ select: policySelect, orderBy: { priority: 'asc' } });
  return { policies, timeModel: TIME_MODEL };
}

async function updatePolicy(id, data, user, requestId) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.slaPolicy.findUnique({ where: { id }, select: policySelect });
    if (!current) throw new AppError('SLA policy not found', 404);
    if (current.version !== data.version) throw new AppError('This SLA policy was changed by another administrator. Refresh and try again.', 409);
    const changedFields = ['firstResponseMinutes', 'resolutionMinutes', 'dueSoonMinutes', 'isActive']
      .filter((field) => current[field] !== data[field]);
    if (!changedFields.length) return current;
    const result = await tx.slaPolicy.updateMany({
      where: { id, version: data.version },
      data: { firstResponseMinutes: data.firstResponseMinutes, resolutionMinutes: data.resolutionMinutes, dueSoonMinutes: data.dueSoonMinutes, isActive: data.isActive, version: { increment: 1 } },
    });
    if (!result.count) {
      throw new AppError('This SLA policy was changed by another administrator. Refresh and try again.', 409);
    }
    const policy = await tx.slaPolicy.findUnique({ where: { id }, select: policySelect });
    await tx.auditEvent.create({ data: { eventType: 'sla.policy_updated', entityType: 'sla_policy', entityId: id, actorUserId: user.id, requestId, metadata: { changedFields } } });
    return policy;
  });
}

module.exports = { policySelect, listPolicies, updatePolicy };
