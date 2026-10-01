const { database, fingerprint, runtimeIdentity, fail } = require('./safety.cjs');
module.exports = async () => {
  // Vite may still transform dependencies after the runner's first readiness
  // response. Match its bounded startup allowance; keep per-test checks strict.
  await runtimeIdentity(process.env, 15000);
  const db = await database(); let before;
  try { before = await fingerprint(db); } catch (error) { await db.$disconnect(); throw error; }
  return async () => {
    try {
      await runtimeIdentity();
      if (JSON.stringify(await fingerprint(db)) !== JSON.stringify(before)) throw fail('GLOBAL_FIXTURE_CLEANUP');
      console.log('E2E global fixture baseline restored');
    } finally { await db.$disconnect(); }
  };
};
