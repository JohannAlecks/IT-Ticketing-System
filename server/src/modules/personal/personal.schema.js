const { z } = require('zod');
const { listQuerySchema } = require('../tickets/ticket.schema');
const { ROUTES } = require('./personal.policy');
// Persist only structured criteria from the existing ticket list contract.
// Search stays transient: free text can contain private content or credentials.
const filtersSchema = listQuerySchema.pick({ status: true, priority: true, category: true, assignedToId: true,
  slaState: true, department: true, assignmentState: true, pendingReason: true, sortField: true, sortDirection: true,
}).extend({ isWorkBlocking: z.boolean().optional() }).strict();
const name = z.string().trim().min(1).max(60).refine((s) => !/[\u0000-\u001f\u007f]/.test(s) && s.normalize('NFKC').toLowerCase().length <= 120, 'Invalid normalized name or control characters');
const label = z.string().trim().min(1).max(40).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Control characters are not allowed');
const version = z.number().int().positive().max(2147483647);
const scope = z.enum(['MY_TICKETS', 'ASSIGNED_TO_ME', 'ALL_AUTHORIZED', 'ARCHIVED']);
const createViewSchema = z.object({ name, scope, filters: filtersSchema }).strict();
const updateViewSchema = z.object({ name: name.optional(), scope: scope.optional(), filters: filtersSchema.optional(), version }).strict()
  .refine((v) => ['name', 'scope', 'filters'].some((k) => Object.hasOwn(v, k)), 'At least one change is required');
const deleteSchema = z.object({ version }).strict();
const createShortcutSchema = z.discriminatedUnion('targetType', [
  z.object({ label, targetType: z.literal('ROUTE'), routeKey: z.enum(Object.keys(ROUTES)) }).strict(),
  z.object({ label, targetType: z.literal('SAVED_VIEW'), savedViewId: z.string().uuid() }).strict(),
]);
const updateShortcutSchema = z.object({ label, version }).strict();
const reorderSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), version }).strict()).max(8) }).strict()
  .refine(({ items }) => new Set(items.map((i) => i.id)).size === items.length, 'Duplicate shortcut IDs');
const executeSchema = listQuerySchema.pick({ page: true, limit: true }).strict();
const emptySchema = z.object({}).strict();
module.exports = { filtersSchema, createViewSchema, updateViewSchema, deleteSchema, createShortcutSchema, updateShortcutSchema, reorderSchema, executeSchema, emptySchema };
