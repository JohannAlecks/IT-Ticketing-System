const bcrypt = require('bcrypt');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const departments = require('../departments/department.service');
const { departmentSelect, exposeDepartment } = require('../departments/department.projection');

const safeUser = { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true, ...departmentSelect, createdAt: true, updatedAt: true };

async function getMySettings(userId) { return exposeDepartment(await prisma.user.findUnique({ where: { id: userId }, select: safeUser })); }
async function updateMyProfile(userId, { name, departmentId, previousDepartmentId }, requestId) {
  return departments.transaction({ id: userId }, async (tx) => {
    if (departmentId !== undefined) {
      await departments.setMembership(tx, userId, departmentId, previousDepartmentId);
      await tx.auditEvent.create({ data: { eventType: 'user.department_changed', entityType: 'user', entityId: userId, actorUserId: userId, requestId, metadata: { previousDepartmentId, departmentId } } });
    }
    return exposeDepartment(await tx.user.update({ where: { id: userId }, data: { name }, select: safeUser }));
  }, false);
}
async function changeMyPassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) throw new AppError('Your current password is incorrect', 422);
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 12) } });
}
function getSystemInfo() { return { environment: env.NODE_ENV, jwtExpiresIn: env.JWT_EXPIRES_IN, attachmentProvider: env.STORAGE_PROVIDER, maxAttachmentSizeMb: env.MAX_ATTACHMENT_SIZE_MB, emailDeliveryConfigured: env.EMAIL_PROVIDER === 'resend' }; }

module.exports = { getMySettings, updateMyProfile, changeMyPassword, getSystemInfo };
