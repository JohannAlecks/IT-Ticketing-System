const { createHash } = require('crypto');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const schema = require('./emailLog.schema');

const select = {
  id: true, messageType: true, recipientMasked: true, provider: true, status: true,
  providerMessageId: true, attemptCount: true, errorCategory: true,
  createdAt: true, updatedAt: true, acceptedAt: true, failedAt: true,
};
const warn = () => console.warn('Email operational log unavailable (details redacted)');
function maskRecipient(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\s\x00-\x1f\x7f]/.test(value) || !z.string().email().safeParse(value).success) throw new AppError('Invalid email metadata', 422);
  const [local, domain] = value.toLowerCase().split('@');
  const initial = (s) => /^[a-z0-9]/.test(s) ? s[0] : '*';
  return `${initial(local)}***@${initial(domain)}***.***`;
}
function metadata({ to, messageType, idempotencyKey }) {
  // Only a non-secret token-record UUID, never the raw verification token.
  if (messageType !== 'EMAIL_VERIFICATION' || typeof idempotencyKey !== 'string' || !idempotencyKey.startsWith('verify-email/') || !z.string().uuid().safeParse(idempotencyKey.slice(13)).success) throw new AppError('Invalid email metadata', 422);
  return { messageType, recipientMasked: maskRecipient(to), idempotencyHash: createHash('sha256').update(idempotencyKey).digest('hex') };
}
async function begin(input) {
  const fields = metadata(input);
  const disabled = env.EMAIL_PROVIDER === 'disabled';
  try {
    const row = await prisma.emailLog.create({ data: {
      ...fields, provider: disabled ? 'DISABLED' : 'RESEND', status: disabled ? 'DISABLED' : 'UNKNOWN',
      errorCategory: disabled ? 'EMAIL_DISABLED' : 'NOT_CONFIRMED', attemptCount: disabled ? 0 : 1,
    }, select });
    return { row, shouldSend: !disabled };
  } catch (error) {
    if (error.code === 'P2002') {
      try {
        const row = await prisma.emailLog.findUnique({ where: { idempotencyHash: fields.idempotencyHash }, select });
        if (row) return { row, shouldSend: false };
      } catch { /* fail closed below */ }
    }
    warn(); throw new AppError('Email operation unavailable', 503);
  }
}
const completion = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ACCEPTED'), providerMessageId: z.string().uuid() }).strict(),
  z.object({ status: z.literal('FAILED'), errorCategory: z.literal('PROVIDER_REJECTED') }).strict(),
  z.object({ status: z.literal('UNKNOWN'), errorCategory: z.enum(['TIMEOUT', 'TRANSPORT_ERROR', 'INVALID_RESPONSE']) }).strict(),
]);
async function finish(id, result) {
  const parsed = completion.safeParse(result);
  if (!parsed.success) { warn(); return false; }
  const value = parsed.data;
  try {
    // Only the owner of a newly reserved attempt completes it once. Terminal
    // outcomes cannot be overwritten by a delayed or repeated callback.
    const updated = await prisma.emailLog.updateMany({
      where: { id, status: 'UNKNOWN', errorCategory: 'NOT_CONFIRMED' },
      data: { ...value, errorCategory: value.errorCategory || null,
        ...(value.status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
        ...(value.status === 'FAILED' ? { failedAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1) warn();
    return updated.count === 1;
  } catch { warn(); return false; }
}
async function requireAdmin(actor) {
  const current = await prisma.user.findUnique({ where: { id: actor.id }, select: { role: true, isActive: true, emailVerified: true } });
  if (!current?.isActive || !current.emailVerified) throw new AppError('Authentication required', 401);
  if (current.role !== 'ADMIN') throw new AppError('Administrator access required', 403);
}
function filters(q) {
  return { ...(q.status ? { status: q.status } : {}), ...(q.messageType ? { messageType: q.messageType } : {}), ...(q.id ? { id: q.id } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000) } : {}) } } : {}),
  };
}
async function list(actor, input) {
  const parsed = schema.list.safeParse(input);
  if (!parsed.success) throw new AppError('Invalid email log filters', 422);
  const q = parsed.data;
  await requireAdmin(actor);
  const where = filters(q);
  // One read snapshot keeps totals, status counts and page rows consistent.
  return prisma.$transaction(async (tx) => {
    const logs = await tx.emailLog.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit });
    const total = await tx.emailLog.count({ where });
    const groups = await tx.emailLog.groupBy({ by: ['status'], where: filters({ ...q, status: undefined }), _count: { _all: true } });
    const counts = Object.fromEntries(schema.statuses.map((s) => [s, groups.find((g) => g.status === s)?._count._all || 0]));
    return { logs, counts, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) }, provider: env.EMAIL_PROVIDER, deliveryTracking: false, retrySupported: false };
  }, { isolationLevel: 'RepeatableRead' });
}
async function detail(actor, id) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError('Invalid email log ID', 422);
  await requireAdmin(actor);
  const row = await prisma.emailLog.findUnique({ where: { id }, select });
  if (!row) throw new AppError('Email log not found', 404);
  return row;
}
module.exports = { begin, finish, maskRecipient, metadata, list, detail, select };
