import api from './axios';
const data = (response) => response.data.data;
export const personalApi = {
  views: (signal) => api.get('/saved-views', { signal }).then(data),
  shortcuts: (signal) => api.get('/shortcuts', { signal }).then(data),
  execute: (id, params, signal) => api.get(`/saved-views/${encodeURIComponent(id)}/tickets`, { params, signal }).then(data),
  createView: (body) => api.post('/saved-views', body).then(data),
  updateView: ({ id, ...body }) => api.patch(`/saved-views/${encodeURIComponent(id)}`, body).then(data),
  deleteView: ({ id, version }) => api.delete(`/saved-views/${encodeURIComponent(id)}`, { data: { version } }),
  createShortcut: (body) => api.post('/shortcuts', body).then(data),
  updateShortcut: ({ id, ...body }) => api.patch(`/shortcuts/${encodeURIComponent(id)}`, body).then(data),
  deleteShortcut: ({ id, version }) => api.delete(`/shortcuts/${encodeURIComponent(id)}`, { data: { version } }),
  reorder: (body) => api.patch('/shortcuts/reorder', body).then(data),
};
