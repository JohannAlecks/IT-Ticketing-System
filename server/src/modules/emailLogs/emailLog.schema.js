const { z } = require('zod');
const statuses = ['DISABLED', 'UNKNOWN', 'ACCEPTED', 'FAILED'];
const types = ['EMAIL_VERIFICATION'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '2000-01-01' && s <= '2100-12-31';
}, 'Invalid UTC date');
const list = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(statuses).optional(), messageType: z.enum(types).optional(),
  from: date.optional(), to: date.optional(),
  // Exact opaque internal log ID only: no recipient, URL or content search.
  id: z.string().uuid().optional(),
}).strict().refine((q) => !q.from || !q.to || q.from <= q.to, 'Start date must precede end date');
module.exports = { list, statuses, types };
