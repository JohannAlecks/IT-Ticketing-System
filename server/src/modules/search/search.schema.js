const { z } = require('zod');
const q = z.string().max(100).refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), 'Control characters are not allowed')
  .transform((v) => v.trim().replace(/\s+/gu, ' '))
  .refine((v) => (v.match(/[\p{L}\p{N}]/gu) || []).length >= 2, 'Enter at least two letters or numbers');
const integer = (max, fallback) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).optional().default(String(fallback));
const common = { q, type: z.enum(['all', 'tickets', 'knowledge', 'users']).optional().default('all'),
  includeArchived: z.enum(['true', 'false']).optional().default('false').transform((v) => v === 'true') };
const quickSchema = z.object({ ...common, limit: integer(5, 5) }).strict();
const resultsSchema = z.object({ ...common, page: integer(100, 1), pageSize: integer(20, 20) }).strict();
module.exports = { quickSchema, resultsSchema };
