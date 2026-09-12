// The root Jest beforeAll verifies identity and schema; Prisma is blocked until
// that succeeds, including in any afterAll that follows a failed guard.
const enabled = process.env.RUN_DB_TESTS === 'true';
module.exports = { enabled, describeDb: enabled ? describe : describe.skip };
