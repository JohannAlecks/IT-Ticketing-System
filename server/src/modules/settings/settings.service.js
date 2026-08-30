const bcrypt = require('bcrypt');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');

const safeUser = { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true, department: true, createdAt: true, updatedAt: true };

async function getMySettings(userId) { return prisma.user.findUnique({ where: { id: userId }, select: safeUser }); }
async function updateMyProfile(userId, { name, department }) { return prisma.user.update({ where: { id: userId }, data: { name, department }, select: safeUser }); }
async function changeMyPassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) throw new AppError('Your current password is incorrect', 422);
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 12) } });
}
function getSystemInfo() { return { environment: env.NODE_ENV, jwtExpiresIn: env.JWT_EXPIRES_IN, attachmentProvider: env.STORAGE_PROVIDER, maxAttachmentSizeMb: env.MAX_ATTACHMENT_SIZE_MB, emailDeliveryConfigured: Boolean(env.EMAIL_PROVIDER) }; }

module.exports = { getMySettings, updateMyProfile, changeMyPassword, getSystemInfo };
