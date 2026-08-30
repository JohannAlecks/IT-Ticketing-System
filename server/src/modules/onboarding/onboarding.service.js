const prisma = require('../../config/prisma');
async function getOnboarding(userId) { return prisma.userOnboarding.upsert({ where: { userId }, create: { userId, completedSteps: [] }, update: {} }); }
async function updateOnboarding(userId, data) {
  const current = await getOnboarding(userId);
  const completedSteps = data.completedSteps === undefined ? current.completedSteps : [...new Set(data.completedSteps)];
  const completedAt = completedSteps.length ? new Date() : null;
  return prisma.userOnboarding.update({ where: { userId }, data: { completedSteps, dismissedAt: data.dismissed === undefined ? current.dismissedAt : (data.dismissed ? new Date() : null), completedAt } });
}
module.exports = { getOnboarding, updateOnboarding };
