const { z } = require('zod');

const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(100), departmentId: z.string().uuid().nullable().optional(), previousDepartmentId: z.string().uuid().nullable().optional() }).strict().refine((v) => v.departmentId === undefined || v.previousDepartmentId !== undefined, 'Previous department is required when changing membership');
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128).regex(/[a-z]/, 'New password must include a lowercase letter').regex(/[A-Z]/, 'New password must include an uppercase letter').regex(/\d/, 'New password must include a number').regex(/[^A-Za-z0-9]/, 'New password must include a special character'),
}).strict();

module.exports = { updateProfileSchema, changePasswordSchema };
