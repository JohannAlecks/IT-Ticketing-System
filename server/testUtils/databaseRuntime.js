// Each Jest file has its own module registry. Only its root beforeAll guard may
// unlock real Prisma operations; cleanup also remains blocked after guard failure.
module.exports = { verified: false };
