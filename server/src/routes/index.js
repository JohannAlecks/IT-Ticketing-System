const express = require('express');
const router = express.Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/users', require('../modules/users/user.routes'));
router.use('/tickets', require('../modules/tickets/ticket.routes'));
router.use('/dashboard', require('../modules/dashboard/dashboard.routes'));
router.use('/reports', require('../modules/reports/report.routes'));
router.use('/audit-events', require('../modules/audit/audit.routes'));
router.use('/settings', require('../modules/settings/settings.routes'));
router.use('/onboarding', require('../modules/onboarding/onboarding.routes'));
router.use('/knowledge', require('../modules/knowledge/knowledge.routes'));

module.exports = router;
