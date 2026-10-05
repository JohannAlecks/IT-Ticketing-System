// Explicit one-time bootstrap for a NEW, empty deployment only. Never a seed.
async function bootstrap(prisma, input, hash) {
  if (input.BOOTSTRAP_APPROVED !== 'true' || input.NODE_ENV !== 'production') throw new Error('Bootstrap not approved');
  const parsed = require('../src/modules/users/user.schema').createUserSchema.safeParse({
    name: input.BOOTSTRAP_ADMIN_NAME, email: input.BOOTSTRAP_ADMIN_EMAIL,
    password: input.BOOTSTRAP_ADMIN_PASSWORD, role: 'ADMIN',
  });
  if (!parsed.success || parsed.data.password.length < 16) throw new Error('Invalid bootstrap input');
  const password = await hash(parsed.data.password, 12);
  await prisma.$transaction(async (tx) => {
    // Empty database and stopped writers are mandatory. Prevent concurrent bootstrap.
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if (await tx.user.count() !== 0) throw new Error('Bootstrap requires an empty user table');
    const user = await tx.user.create({ data: { name: parsed.data.name, email: parsed.data.email, password, role: 'ADMIN', isActive: true, emailVerified: true }, select: { id: true } });
    await tx.auditEvent.create({ data: { eventType: 'account.bootstrap', entityType: 'user', entityId: user.id, actorUserId: user.id } });
  }, { isolationLevel: 'Serializable' });
}
async function main() {
  let db;
  try {
    if (process.env.NODE_ENV !== 'production' || process.env.BOOTSTRAP_APPROVED !== 'true') throw new Error('Bootstrap not approved');
    // Configuration validation runs before acquiring a client. No dotenv in production.
    require('../src/config/env');
    db = require('../src/config/prisma');
    if (!await require('../src/config/readiness').createReadiness(db).check()) throw new Error('Database not ready');
    await bootstrap(db, process.env, require('bcrypt').hash);
    console.log('First administrator created; remove bootstrap variables immediately.');
  } catch { console.error('Bootstrap refused or failed (details redacted)'); process.exitCode = 1; }
  finally {
    if (db) await db.$disconnect().catch(() => { console.error('Bootstrap connection close failed (details redacted)'); process.exitCode = 1; });
  }
}
if (require.main === module) void main();
module.exports = { bootstrap };
