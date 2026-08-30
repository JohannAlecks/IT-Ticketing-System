const { z } = require('zod');

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
  isInternal: z.boolean().optional().default(false),
});

module.exports = { createCommentSchema };
