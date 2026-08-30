const { z } = require('zod');

const department = z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? null : value, z.string().trim().min(2).max(100).nullable());
const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(100), department }).strict();
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128).regex(/[a-z]/, 'New password must include a lowercase letter').regex(/[A-Z]/, 'New password must include an uppercase letter').regex(/\d/, 'New password must include a number').regex(/[^A-Za-z0-9]/, 'New password must include a special character'),
}).strict();

module.exports = { updateProfileSchema, changePasswordSchema };
