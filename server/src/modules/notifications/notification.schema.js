const { z } = require('zod');

const TYPES = ['TICKET_ASSIGNED', 'TICKET_UNASSIGNED', 'TICKET_STATUS_CHANGED', 'TICKET_PUBLIC_REPLY', 'TICKET_WORK_BLOCKING', 'KNOWLEDGE_SUBMITTED', 'KNOWLEDGE_PUBLISHED', 'KNOWLEDGE_RETURNED', 'ACCOUNT_REACTIVATED'];
const listQuerySchema = z.object({
  status: z.enum(['ALL', 'UNREAD']).optional().default('ALL'),
  type: z.enum(TYPES).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();
const emptyBodySchema = z.object({}).strict();

module.exports = { TYPES, listQuerySchema, emptyBodySchema };
