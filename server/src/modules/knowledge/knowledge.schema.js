const { z } = require('zod');

const CATEGORIES = ['INTERNET_NETWORK', 'VPN', 'PC_LAPTOP', 'PRINTER_SCANNER', 'ACCOUNTS_ACCESS', 'EMAIL', 'SOFTWARE_APPLICATION', 'SERVER_SYSTEM', 'REQUESTS', 'SECURITY', 'OTHERS'];
const STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'];
const VISIBILITIES = ['PUBLIC', 'INTERNAL'];

const plainText = (max, label) => z.string().max(max, `${label} is too long`).refine(
  (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) && !/<\s*\/?\s*[a-z][^>]*>/i.test(value),
  `${label} must be plain text`,
);
const trimmed = (max, label) => z.preprocess((value) => typeof value === 'string' ? value.trim() : value, plainText(max, label));
const titleSchema = trimmed(150, 'Title').refine((value) => value.length >= 5, 'Title must be at least 5 characters');
const summarySchema = trimmed(300, 'Summary');
const contentSchema = plainText(50000, 'Content');
const versionSchema = z.coerce.number().int().min(1);

const normalizedTagsSchema = z.array(trimmed(30, 'Tag').refine((tag) => tag.length >= 2 && /^[a-zA-Z0-9 -]+$/.test(tag), 'Tags use letters, numbers, spaces, and hyphens only'))
  .max(8)
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

const createArticleSchema = z.object({
  title: titleSchema,
  summary: summarySchema.optional().default(''),
  content: contentSchema.optional().default(''),
  visibility: z.enum(VISIBILITIES).optional(),
  ticketCategory: z.enum(CATEGORIES).optional(),
  tags: normalizedTagsSchema.optional().default([]),
}).strict();

const updateArticleSchema = z.object({
  title: titleSchema.optional(),
  summary: summarySchema.optional(),
  content: contentSchema.optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  ticketCategory: z.enum(CATEGORIES).optional(),
  tags: normalizedTagsSchema.optional(),
  version: versionSchema,
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'version'), 'Provide at least one editable field');

const listQuerySchema = z.object({
  scope: z.enum(['read', 'manage']).optional().default('read'),
  search: trimmed(100, 'Search').optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  sort: z.enum(['published', 'updated']).optional().default('published'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

const suggestionQuerySchema = z.object({
  category: z.enum(CATEGORIES),
  search: trimmed(100, 'Search').optional(),
  limit: z.coerce.number().int().min(1).max(5).optional().default(3),
}).strict();

const submitSchema = z.object({ version: versionSchema }).strict();
const publishSchema = z.object({ version: versionSchema }).strict();
const archiveSchema = z.object({ version: versionSchema }).strict();
const returnToDraftSchema = z.object({
  version: versionSchema,
  reviewNote: trimmed(1000, 'Review note').refine((value) => value.length >= 5, 'Review note must be at least 5 characters'),
}).strict();
const restoreSchema = z.object({
  version: versionSchema,
  targetStatus: z.enum(['DRAFT', 'PUBLISHED']),
}).strict();
const feedbackSchema = z.object({ helpful: z.boolean() }).strict();

module.exports = {
  CATEGORIES,
  STATUSES,
  VISIBILITIES,
  createArticleSchema,
  updateArticleSchema,
  listQuerySchema,
  suggestionQuerySchema,
  submitSchema,
  publishSchema,
  archiveSchema,
  returnToDraftSchema,
  restoreSchema,
  feedbackSchema,
};
