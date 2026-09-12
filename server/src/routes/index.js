const express = require('express');
const router = express.Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/users', require('../modules/users/user.routes'));
router.use('/departments', require('../modules/departments/department.routes'));
router.use('/email-logs', require('../modules/emailLogs/emailLog.routes'));
router.use('/tickets', require('../modules/tickets/ticket.routes'));
router.use('/dashboard', require('../modules/dashboard/dashboard.routes'));
router.use('/reports', require('../modules/reports/report.routes'));
router.use('/audit-events', require('../modules/audit/audit.routes'));
router.use('/settings', require('../modules/settings/settings.routes'));
router.use('/onboarding', require('../modules/onboarding/onboarding.routes'));
router.use('/knowledge', require('../modules/knowledge/knowledge.routes'));
router.use('/notifications', require('../modules/notifications/notification.routes'));
router.use('/sla', require('../modules/sla/sla.routes'));
router.use('/satisfaction', require('../modules/satisfaction/satisfaction.routes').router);
router.use('/saved-views', require('../modules/personal/personal.routes').views);
router.use('/shortcuts', require('../modules/personal/personal.routes').shortcuts);
router.use('/search', require('../modules/search/search.routes'));

module.exports = router;
