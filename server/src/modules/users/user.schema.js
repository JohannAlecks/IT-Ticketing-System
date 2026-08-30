const { z } = require('zod');

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
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
});

module.exports = { createUserSchema, updateRoleSchema, setActiveSchema, emptyBodySchema, listUsersQuerySchema };
