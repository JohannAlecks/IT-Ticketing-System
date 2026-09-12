beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') return;
  const filename = expect.getState().testPath.replace(/\\/g, '/');
  if (!Object.values(require('./databaseSuites')).some((file) => filename.endsWith(`/${file}`))) return;
  const { validateEnvironment, verifyDatabase } = require('./databaseGuard');
  validateEnvironment();
  // Unwrapped client is used ONLY for the guard's read-only identity checks.
  const { PrismaClient } = jest.requireActual('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } }, log: [] });
  try {
    await verifyDatabase(db);
    require('./databaseRuntime').verified = true;
  } finally { await db.$disconnect(); }
}, 15000);
