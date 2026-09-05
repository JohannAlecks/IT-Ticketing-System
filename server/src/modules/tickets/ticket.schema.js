const { z } = require('zod');

const STATUS = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CATEGORY = ['INTERNET_NETWORK','VPN','PC_LAPTOP','PRINTER_SCANNER','ACCOUNTS_ACCESS','EMAIL','SOFTWARE_APPLICATION','SERVER_SYSTEM','REQUESTS','SECURITY','OTHERS'];

const impactDescriptionSchema = z.preprocess(
  (value) => typeof value === 'string' ? value.trim() : value,
  z.string().max(500).nullable().optional()
);

const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(10000, 'Description is too long (max 10,000 characters)'),
  priority: z.enum(PRIORITY).optional(),
  category: z.enum(CATEGORY).optional(),
  isWorkBlocking: z.coerce.boolean().optional().default(false),
  impactDescription: impactDescriptionSchema,
}).strict().superRefine((data, context) => {
  if (data.isWorkBlocking && (!data.impactDescription || data.impactDescription.length < 10)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['impactDescription'], message: 'Explain how this is blocking your work' });
  }
});

const updateTicketSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(10000, 'Description is too long (max 10,000 characters)').optional(),
  status: z.enum(STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  category: z.enum(CATEGORY).optional(),
}).strict();

const assignTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable(), // null = unassign
}).strict();

const archiveActionSchema = z.object({}).strict();

const listQuerySchema = z.object({
  status: z.enum(STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  category: z.enum(CATEGORY).optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().optional(),
  archive: z.enum(['active', 'archived']).optional().default('active'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

module.exports = {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  archiveActionSchema,
  listQuerySchema,
  STATUS,
  PRIORITY,
  CATEGORY,
};
