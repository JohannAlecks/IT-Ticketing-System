const mockDb = {
  emailLog: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  user: { findUnique: jest.fn() }, $transaction: jest.fn(),
};
const mockEnv = { EMAIL_PROVIDER: 'disabled', RESEND_API_KEY: 'fixture-key', EMAIL_FROM: 'sender@example.test', EMAIL_DELIVERY_TIMEOUT_MS: 20 };
const mockSend = jest.fn();
jest.mock('../../../config/prisma', () => mockDb);
jest.mock('../../../config/env', () => mockEnv);
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend }, logError: jest.fn() })) }));
const service = require('../emailLog.service');
const { sendMail } = require('../../../utils/mailer');
const schema = require('../emailLog.schema');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const message = { to: 'private.person@example.test', subject: 'Private subject', html: '<p>Private body</p>', text: 'https://example.test/verify-email?token=synthetic-private-token', messageType: 'EMAIL_VERIFICATION', idempotencyKey: `verify-email/${id}` };
let warn;
beforeEach(() => {
  jest.clearAllMocks(); mockEnv.EMAIL_PROVIDER = 'disabled';
  mockDb.emailLog.create.mockImplementation(async ({ data }) => ({ id, ...data }));
  mockDb.emailLog.updateMany.mockResolvedValue({ count: 1 });
  mockDb.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true, emailVerified: true });
  mockDb.$transaction.mockImplementation(async (fn) => fn(mockDb));
  mockDb.emailLog.findMany.mockResolvedValue([]); mockDb.emailLog.count.mockResolvedValue(0); mockDb.emailLog.groupBy.mockResolvedValue([]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); jest.useRealTimers(); });
test.each([
  ['private.person@example.test', 'p***@e***.***'], ['A@B.test', 'a***@b***.***'], ["'name@example.test", '****@e***.***'],
])('masks local part and domain without storing full address: %#', (value, masked) => expect(service.maskRecipient(value)).toBe(masked));
test.each(['invalid', 'a@example.test\r\nBcc: other@example.test', ['a@example.test'], null])('rejects invalid/multiple recipients %#', (value) => expect(() => service.maskRecipient(value)).toThrow('Invalid email metadata'));
test('disabled delivery persists a masked zero-attempt log without constructing Resend', async () => {
  expect(await sendMail(message)).toEqual({ status: 'unavailable' });
  expect(require('resend').Resend).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
  const data = mockDb.emailLog.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ provider: 'DISABLED', status: 'DISABLED', recipientMasked: 'p***@e***.***', attemptCount: 0, errorCategory: 'EMAIL_DISABLED' });
  expect(Object.keys(data).sort()).toEqual(['attemptCount', 'errorCategory', 'idempotencyHash', 'messageType', 'provider', 'recipientMasked', 'status']);
  for (const secret of [message.to, message.subject, message.html, message.text, message.idempotencyKey, mockEnv.RESEND_API_KEY]) expect(JSON.stringify(data).includes(secret)).toBe(false);
});
test.each([{ messageType: 'TICKET_CONTENT' }, { idempotencyKey: 'verify-email/raw-secret-token' }, { idempotencyKey: undefined }])('invalid internal metadata fails before reservation or provider: %#', async (patch) => {
  mockEnv.EMAIL_PROVIDER = 'resend'; expect(await sendMail({ ...message, ...patch })).toEqual({ status: 'failed' });
  expect(mockDb.emailLog.create).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});
test('accepted response stores only safe UUID evidence, never delivered', async () => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockSend.mockResolvedValue({ data: { id }, raw: message.text });
  expect(await sendMail(message)).toEqual({ status: 'accepted' });
  expect(mockDb.emailLog.create.mock.calls[0][0].data).toMatchObject({ status: 'UNKNOWN', errorCategory: 'NOT_CONFIRMED', attemptCount: 1 });
  expect(mockDb.emailLog.updateMany.mock.calls[0][0]).toMatchObject({ where: { id, status: 'UNKNOWN', errorCategory: 'NOT_CONFIRMED' }, data: { status: 'ACCEPTED', providerMessageId: id, errorCategory: null, acceptedAt: expect.any(Date) } });
  expect(mockSend.mock.calls[0][1].idempotencyKey).toBe(message.idempotencyKey);
});
test.each([
  [{ error: { statusCode: 422, message: message.text } }, 'FAILED', 'PROVIDER_REJECTED'],
  [{ error: { statusCode: 500, message: message.text } }, 'UNKNOWN', 'TRANSPORT_ERROR'],
  [{ error: { statusCode: 408 } }, 'UNKNOWN', 'TRANSPORT_ERROR'],
  [{ error: { statusCode: 409 } }, 'UNKNOWN', 'TRANSPORT_ERROR'],
  [{ error: { message: message.text } }, 'UNKNOWN', 'TRANSPORT_ERROR'],
  [{ data: { id: message.text } }, 'UNKNOWN', 'INVALID_RESPONSE'],
])('classifies provider response without raw errors %#', async (response, status, category) => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockSend.mockResolvedValue(response);
  expect(await sendMail(message)).toEqual({ status: status === 'FAILED' ? 'failed' : 'unknown' });
  const stored = mockDb.emailLog.updateMany.mock.calls[0][0].data;
  expect(stored).toMatchObject({ status, errorCategory: category });
  expect(JSON.stringify(stored).includes(message.text)).toBe(false);
});
test('throwing provider is unknown; exception text never persists or escapes', async () => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockSend.mockRejectedValue(new Error(message.text));
  expect(await sendMail(message)).toEqual({ status: 'unknown' });
  expect(mockDb.emailLog.updateMany.mock.calls[0][0].data).toEqual({ status: 'UNKNOWN', errorCategory: 'TRANSPORT_ERROR' });
});
test('bounded timeout aborts, remains unknown, and late acceptance cannot overwrite it', async () => {
  jest.useFakeTimers(); mockEnv.EMAIL_PROVIDER = 'resend'; let release; let signal;
  mockSend.mockImplementation((payload, options) => { signal = options.signal; return new Promise((resolve) => { release = resolve; }); });
  const pending = sendMail(message); await jest.advanceTimersByTimeAsync(21);
  expect(await pending).toEqual({ status: 'unknown' }); expect(signal.aborted).toBe(true);
  expect(mockDb.emailLog.updateMany.mock.calls[0][0].data).toEqual({ status: 'UNKNOWN', errorCategory: 'TIMEOUT' });
  release({ data: { id } }); await jest.advanceTimersByTimeAsync(1); expect(mockDb.emailLog.updateMany).toHaveBeenCalledTimes(1);
});
test.each(['UNKNOWN', 'DISABLED', 'ACCEPTED', 'FAILED'])('duplicate %s reservation never resends', async (status) => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockDb.emailLog.create.mockRejectedValue({ code: 'P2002' }); mockDb.emailLog.findUnique.mockResolvedValue({ id, status });
  await sendMail(message); expect(mockSend).not.toHaveBeenCalled(); expect(mockDb.emailLog.updateMany).not.toHaveBeenCalled();
});
test('overlapping mailer calls receive one provider-send permit', async () => {
  mockEnv.EMAIL_PROVIDER = 'resend'; let reserved = false;
  mockDb.emailLog.create.mockImplementation(async ({ data }) => { if (reserved) throw { code: 'P2002' }; reserved = true; return { id, ...data }; });
  mockDb.emailLog.findUnique.mockResolvedValue({ id, status: 'UNKNOWN' });
  mockSend.mockResolvedValue({ data: { id } });
  const results = await Promise.all([sendMail(message), sendMail(message), sendMail(message)]);
  expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'unknown')).toHaveLength(2);
  expect(mockSend).toHaveBeenCalledTimes(1);
});
test('reservation failure prevents any provider request and emits only a fixed safe warning', async () => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockDb.emailLog.create.mockRejectedValue(new Error(message.text));
  expect(await sendMail(message)).toEqual({ status: 'failed' }); expect(mockSend).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('Email operational log unavailable (details redacted)');
});
test('completion persistence failure does not lie about observed acceptance or retry', async () => {
  mockEnv.EMAIL_PROVIDER = 'resend'; mockSend.mockResolvedValue({ data: { id } }); mockDb.emailLog.updateMany.mockRejectedValue(new Error(message.text));
  expect(await sendMail(message)).toEqual({ status: 'accepted' }); expect(mockSend).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('Email operational log unavailable (details redacted)');
});
test.each([{ status: 'DELIVERED' }, { status: 'ACCEPTED', providerMessageId: id, body: message.text }, { status: 'FAILED', errorCategory: message.text }])('rejects fabricated or sensitive completion metadata %#', async (outcome) => {
  expect(await service.finish(id, outcome)).toBe(false); expect(mockDb.emailLog.updateMany).not.toHaveBeenCalled();
});
test.each(['USER', 'AGENT'])('revalidates current %s role for list and detail', async (role) => {
  mockDb.user.findUnique.mockResolvedValue({ role, isActive: true, emailVerified: true });
  await expect(service.list({ id }, {})).rejects.toMatchObject({ statusCode: 403 });
  await expect(service.detail({ id }, id)).rejects.toMatchObject({ statusCode: 403 }); expect(mockDb.emailLog.findMany).not.toHaveBeenCalled();
});
test('deactivated Admin cannot read metadata', async () => {
  mockDb.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: false, emailVerified: true });
  await expect(service.list({ id }, {})).rejects.toMatchObject({ statusCode: 401 });
});
test.each([{ limit: 51 }, { page: -1 }, { status: 'DELIVERED' }, { messageType: 'SECRET' }, { from: '2026-02-30' }, { from: '2026-02-03', to: '2026-02-02' }, { email: 'private@example.test' }, { id: 'invalid' }, { from: ['2026-01-01'] }])('strict filter validation %#', (q) => expect(schema.list.safeParse(q).success).toBe(false));
test('safe projections, stable pagination, inclusive UTC end date and counts contract', async () => {
  mockDb.emailLog.groupBy.mockResolvedValue([{ status: 'DISABLED', _count: { _all: 3 } }]);
  const result = await service.list({ id }, { page: 2, limit: 10, status: 'FAILED', from: '2026-09-01', to: '2026-09-02' });
  expect(result).toMatchObject({ counts: { DISABLED: 3, UNKNOWN: 0, ACCEPTED: 0, FAILED: 0 }, provider: 'disabled', deliveryTracking: false, retrySupported: false });
  expect(mockDb.emailLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { status: 'FAILED', createdAt: { gte: new Date('2026-09-01'), lt: new Date('2026-09-03') } } });
  expect(mockDb.emailLog.groupBy.mock.calls[0][0].where).not.toHaveProperty('status');
  expect(Object.keys(service.select).sort()).toEqual(['acceptedAt', 'attemptCount', 'createdAt', 'errorCategory', 'failedAt', 'id', 'messageType', 'provider', 'providerMessageId', 'recipientMasked', 'status', 'updatedAt']);
});
test('route authorization and raw database failures use sanitized public contract', async () => {
  const router = require('../emailLog.routes'); const next = jest.fn();
  expect(router.stack[0].handle).toBe(require('../../../middleware/authenticate'));
  for (const role of ['USER', 'AGENT']) expect(() => router.stack[1].handle({ user: { role } }, {}, next)).toThrow(expect.objectContaining({ statusCode: 403 }));
  router.stack.at(-1).handle(new Error(message.text), {}, {}, next);
  expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 503, message: 'Email logs unavailable' }));
  for (const error of [new (require('jsonwebtoken').JsonWebTokenError)(message.text), new (require('jsonwebtoken').TokenExpiredError)(message.text, new Date())]) {
    router.stack.at(-1).handle(error, {}, {}, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 401, message: 'Authentication required' }));
  }
  expect(router.stack.filter((s) => s.route).every((s) => s.route.methods.get && Object.keys(s.route.methods).length === 1)).toBe(true);
});
