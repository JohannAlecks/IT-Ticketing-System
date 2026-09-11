const { z } = require('zod');

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'AGENT', 'USER']),
}).strict();

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'AGENT', 'USER']),
}).strict();

const setActiveSchema = z.object({
  isActive: z.boolean(),
}).strict();

const emptyBodySchema = z.preprocess(
  (value) => value ?? {},
  z.object({}).strict()
);

const listUsersQuerySchema = z.object({
  role: z.enum(['ADMIN', 'AGENT', 'USER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ACTIVE'),
  search: z.string().trim().max(100).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  missingDepartment: z.enum(['true', 'false']).optional(),
  verification: z.enum(['VERIFIED', 'UNVERIFIED']).optional(),
  sort: z.enum(['name', 'newest', 'oldest', 'role', 'department']).default('newest'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

module.exports = { createUserSchema, updateRoleSchema, setActiveSchema, emptyBodySchema, listUsersQuerySchema };
