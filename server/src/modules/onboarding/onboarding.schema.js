const { z } = require('zod');
const updateOnboardingSchema = z.object({ completedSteps: z.array(z.string().min(1).max(80)).max(20).optional(), dismissed: z.boolean().optional() }).refine((data) => data.completedSteps !== undefined || data.dismissed !== undefined, { message: 'Provide onboarding progress or dismissal state' });
module.exports = { updateOnboardingSchema };
