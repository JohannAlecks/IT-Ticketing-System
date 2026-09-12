import api from './axios';
export const emailLogsApi = {
  list: (params, signal) => api.get('/email-logs', { params, signal }).then((r) => r.data.data),
  detail: (id, signal) => api.get(`/email-logs/${encodeURIComponent(id)}`, { signal }).then((r) => r.data.data),
};
