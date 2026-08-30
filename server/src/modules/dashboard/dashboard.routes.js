const express = require('express');
const router = express.Router();

const dashboardController = require('./dashboard.controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

router.use(authenticate);
router.get('/summary', dashboardController.getSummary);
router.get('/stats', dashboardController.getStats);
router.get('/agent-workload', authorize('ADMIN'), dashboardController.getAgentWorkload);

module.exports = router;
