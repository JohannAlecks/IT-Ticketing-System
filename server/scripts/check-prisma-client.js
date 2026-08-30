/* Verifies generated Prisma delegates without connecting to the database. */
const { PrismaClient } = require('@prisma/client');

const REQUIRED_DELEGATES = ['userOnboarding'];
const client = new PrismaClient();

try {
  const missing = REQUIRED_DELEGATES.filter((delegate) => !client[delegate]);
  if (missing.length) throw new Error(`Generated Prisma Client is stale; missing delegate(s): ${missing.join(', ')}`);
  const onboardingService = require('../src/modules/onboarding/onboarding.service');
  if (typeof onboardingService.getOnboarding !== 'function') {
    throw new Error('Onboarding service smoke check failed');
  }
  console.log(`Prisma Client delegate check passed: ${REQUIRED_DELEGATES.join(', ')}`);
} finally {
  void client.$disconnect();
}
