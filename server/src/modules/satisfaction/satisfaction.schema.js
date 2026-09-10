const { z } = require('zod');
const { reportQuerySchema } = require('../reports/report.schema');
const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullable().optional().transform((value) => value || null),
}).strict();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();
const csatReportSchema = reportQuerySchema.pick({ from: true, to: true, agentId: true, department: true }).extend({
  rating: z.coerce.number().int().min(1).max(5).optional(), ...pageSchema.shape,
}).strict();
module.exports = { feedbackSchema, pageSchema, csatReportSchema };
