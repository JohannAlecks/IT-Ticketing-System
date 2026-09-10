import api from './axios';
const unwrap = (response) => response.data.data;
export const satisfactionApi = {
  ticket: (id, params, signal) => api.get(`/tickets/${encodeURIComponent(id)}/satisfaction`, { params, signal }).then(unwrap),
  save: (id, payload, token, update) => api[update ? 'patch' : 'post'](`/tickets/${encodeURIComponent(id)}/satisfaction`, payload, { headers: { 'If-Match': token } }).then(unwrap),
  report: (params, signal) => api.get('/reports/satisfaction', { params, signal }).then(unwrap),
  summary: (signal) => api.get('/satisfaction/summary', { signal }).then(unwrap),
};
