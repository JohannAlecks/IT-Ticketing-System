import api from './axios';

const unwrap = (response) => response.data.data;

export const notificationsApi = {
  list: (params, signal) => api.get('/notifications', { params, signal }).then(unwrap),
  unreadCount: (signal) => api.get('/notifications/unread-count', { signal }).then(unwrap),
  markRead: (id) => api.patch(`/notifications/${encodeURIComponent(id)}/read`).then(unwrap),
  markUnread: (id) => api.patch(`/notifications/${encodeURIComponent(id)}/unread`).then(unwrap),
  markAllRead: () => api.patch('/notifications/read-all').then(unwrap),
};
