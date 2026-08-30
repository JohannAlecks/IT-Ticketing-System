const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // role is intentionally NOT accepted from the client on public registration
  // (prevents self-elevation to ADMIN/AGENT). Admins create agents via a
  // separate protected endpoint (see users.routes.js).
}).strict();

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
}).strict();

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
}).strict();

const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
}).strict();

module.exports = { registerSchema, loginSchema, verifyEmailSchema, resendVerificationSchema };
