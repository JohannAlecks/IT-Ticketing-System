const asyncHandler = require('../../utils/asyncHandler');
const userService = require('./user.service');
const { recordAudit } = require('../audit/audit.service');

const listUsers = asyncHandler(async (req, res) => {
  const { role, status } = req.query;
  const users = await userService.listUsers({ role, status });
  res.status(200).json({ success: true, data: { users } });
});

const listAgents = asyncHandler(async (req, res) => {
  const agents = await userService.listAgents();
  res.status(200).json({ success: true, data: { agents } });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  res.status(200).json({ success: true, data: { user } });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUserWithRole(req.body);
  void recordAudit({ eventType: 'user.created', entityType: 'user', entityId: user.id, actorUserId: req.user.id, requestId: req.requestId, metadata: { role: user.role } });
  res.status(201).json({ success: true, data: { user } });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const user = await userService.updateUserRole(req.params.id, req.body.role, req.user, req.requestId);
  res.status(200).json({ success: true, data: { user } });
});

const setUserActive = asyncHandler(async (req, res) => {
  const result = await userService.setUserActive(req.params.id, req.body.isActive, req.user, req.requestId);
  res.status(200).json({ success: true, data: { user: result.user } });
});
const deactivateUser = asyncHandler(async (req, res) => {
  const result = await userService.deactivateUser(req.params.id, req.user, req.requestId);
  res.status(200).json({ success: true, data: result });
});
const reactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.reactivateUser(req.params.id, req.user, req.requestId);
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { listUsers, listAgents, getUser, createUser, updateUserRole, setUserActive, deactivateUser, reactivateUser };
