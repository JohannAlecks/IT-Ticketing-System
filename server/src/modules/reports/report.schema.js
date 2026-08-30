const { z } = require('zod');
const { TICKET_STATUSES, TICKET_CATEGORIES, TICKET_PRIORITIES } = require('./report.definitions');

const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD UTC calendar date')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Must be a valid UTC calendar date');

const optionalTrimmed = (max) => z.preprocess(
  (value) => typeof value === 'string' ? value.trim() : value,
  z.string().min(1).max(max).optional(),
);

const reportQuerySchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  workBlocking: z.enum(['all', 'yes', 'no']).optional().default('all'),
  department: optionalTrimmed(100),
  agentId: z.string().uuid().optional(),
  search: optionalTrimmed(100),
  interval: z.enum(['day', 'week', 'month']).optional().default('day'),
}).strict();

const ticketQuerySchema = reportQuerySchema.extend({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict();

const exportQuerySchema = reportQuerySchema.extend({
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict();

module.exports = { reportQuerySchema, ticketQuerySchema, exportQuerySchema };
