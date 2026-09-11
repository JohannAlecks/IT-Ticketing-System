import api from './axios';
export const watchersApi = {
  get: (id, signal) => api.get(`/tickets/${encodeURIComponent(id)}/watching`, { signal }).then((r) => r.data.data),
  set: ({ id, watch }) => (watch ? api.post(`/tickets/${encodeURIComponent(id)}/watch`, {}) : api.delete(`/tickets/${encodeURIComponent(id)}/watch`, { data: {} })).then((r) => r.data.data),
};
