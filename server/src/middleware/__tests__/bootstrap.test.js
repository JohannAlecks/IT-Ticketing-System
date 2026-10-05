const { bootstrap } = require('../../../scripts/bootstrap-admin');
const input = { BOOTSTRAP_APPROVED: 'true', NODE_ENV: 'production', BOOTSTRAP_ADMIN_NAME: 'Synthetic Admin', BOOTSTRAP_ADMIN_EMAIL: 'synthetic@example.test', BOOTSTRAP_ADMIN_PASSWORD: 'Synthetic-only-password-123!' };
function fixture(count = 0) {
  const tx = { $executeRaw: jest.fn(), user: { count: jest.fn().mockResolvedValue(count), create: jest.fn().mockResolvedValue({ id: 'synthetic-id' }) }, auditEvent: { create: jest.fn() } };
  return { tx, db: { $transaction: jest.fn((cb) => cb(tx)) } };
}
test('approved bootstrap hashes the password and atomically records a verified admin and audit', async () => {
  const { db, tx } = fixture(); const hash = jest.fn().mockResolvedValue('synthetic-hash');
  await bootstrap(db, input, hash);
  expect(hash).toHaveBeenCalledWith(input.BOOTSTRAP_ADMIN_PASSWORD, 12);
  expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN', emailVerified: true, password: 'synthetic-hash' }) }));
  expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
});
test('bootstrap refuses any existing account and writes nothing', async () => {
  const { db, tx } = fixture(1);
  await expect(bootstrap(db, input, jest.fn())).rejects.toThrow('empty user table');
  expect(tx.user.create).not.toHaveBeenCalled(); expect(tx.auditEvent.create).not.toHaveBeenCalled();
});
test('bootstrap requires separate explicit approval and strong validated input', async () => {
  const { db } = fixture();
  await expect(bootstrap(db, { ...input, BOOTSTRAP_APPROVED: 'false' }, jest.fn())).rejects.toThrow('not approved');
  await expect(bootstrap(db, { ...input, BOOTSTRAP_ADMIN_PASSWORD: 'short' }, jest.fn())).rejects.toThrow('Invalid');
  expect(db.$transaction).not.toHaveBeenCalled();
});
test('audit failure rejects the bootstrap transaction', async () => {
  const { db, tx } = fixture(); tx.auditEvent.create.mockRejectedValue(new Error('synthetic-audit-failure'));
  await expect(bootstrap(db, input, jest.fn())).rejects.toThrow('synthetic-audit-failure');
});
