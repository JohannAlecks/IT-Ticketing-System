const asyncHandler = require('../../utils/asyncHandler');
const service = require('./notification.service');

const list = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: await service.listNotifications(req.user, req.query) }));
const unreadCount = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: { unreadCount: await service.unreadCount(req.user) } }));
const readAll = asyncHandler(async (req, res) => {
  const result = await service.readAll(req.user);
  res.status(200).json({ success: true, data: { updatedCount: result.count } });
});
const markRead = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: { notification: await service.setReadState(req.user, req.params.id, true) } }));
const markUnread = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: { notification: await service.setReadState(req.user, req.params.id, false) } }));
const getPreferences = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: await service.getNotificationPreferences(req.user) }));
const updatePreferences = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: await service.updateNotificationPreferences(req.user, req.body, req.requestId) }));

module.exports = { list, unreadCount, readAll, markRead, markUnread, getPreferences, updatePreferences };
