jest.mock('../../../config/prisma', () => ({
  slaPolicy: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(async (callback) => callback(require('../../../config/prisma'))),
}));

const prisma = require('../../../config/prisma');
const service = require('../sla.service');
const { policyPatchSchema } = require('../sla.schema');

const policy = { id: 'policy-1', name: 'Medium', priority: 'MEDIUM', firstResponseMinutes: 240, resolutionMinutes: 2880, dueSoonMinutes: 60, isActive: true, version: 3 };
const admin = { id: 'admin-1', role: 'ADMIN' };

beforeEach(() => jest.clearAllMocks());

test('policy validation is strict and preserves the shared target bounds', () => {
  expect(policyPatchSchema.safeParse({ ...policy, version: 3 }).success).toBe(false); // name/priority are immutable
  expect(policyPatchSchema.safeParse({ version: 3, firstResponseMinutes: 240, resolutionMinutes: 100, dueSoonMinutes: 60, isActive: true }).success).toBe(false);
  expect(policyPatchSchema.safeParse({ version: 3, firstResponseMinutes: 240, resolutionMinutes: 2880, dueSoonMinutes: 240, isActive: true }).success).toBe(false);
});

test('policy update records only real changes and rejects a stale version', async () => {
  prisma.slaPolicy.findUnique.mockResolvedValue(policy);
  await expect(service.updatePolicy(policy.id, { version: 2, firstResponseMinutes: 240, resolutionMinutes: 2880, dueSoonMinutes: 60, isActive: true }, admin, 'request')).rejects.toMatchObject({ statusCode: 409 });

  prisma.slaPolicy.findUnique.mockResolvedValueOnce(policy).mockResolvedValueOnce({ ...policy, firstResponseMinutes: 300, version: 4 });
  prisma.slaPolicy.updateMany.mockResolvedValue({ count: 1 });
  await service.updatePolicy(policy.id, { version: 3, firstResponseMinutes: 300, resolutionMinutes: 2880, dueSoonMinutes: 60, isActive: true }, admin, 'request');
  expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { changedFields: ['firstResponseMinutes'] } }) }));
});
