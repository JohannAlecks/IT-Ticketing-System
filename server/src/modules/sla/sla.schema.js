const { z } = require('zod');

const positive = (min, max) => z.number().int().min(min).max(max);
const policyPatchSchema = z.object({
  version: positive(1, 2147483647),
  firstResponseMinutes: positive(1, 43200),
  resolutionMinutes: positive(1, 525600),
  dueSoonMinutes: positive(1, 43199),
  isActive: z.boolean(),
}).strict().superRefine((data, context) => {
  if (data.resolutionMinutes < data.firstResponseMinutes) context.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionMinutes'], message: 'Resolution target must be at least the first-response target' });
  if (data.dueSoonMinutes >= data.firstResponseMinutes || data.dueSoonMinutes >= data.resolutionMinutes) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueSoonMinutes'], message: 'Due-soon target must be smaller than both SLA targets' });
});

module.exports = { policyPatchSchema };
