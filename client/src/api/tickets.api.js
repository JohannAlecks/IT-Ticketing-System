import api from './axios';

export const ticketsApi = {
  list: (params, signal) => api.get('/tickets', { params, signal }).then((r) => r.data.data),
  getById: (id, signal) => api.get(`/tickets/${id}`, { signal }).then((r) => r.data.data.ticket),
  create: (payload) => api.post('/tickets', payload).then((r) => r.data.data.ticket),
  update: (id, payload) => api.patch(`/tickets/${id}`, payload).then((r) => r.data.data.ticket),
  assign: (id, assignedToId) =>
    api.patch(`/tickets/${id}/assign`, { assignedToId }).then((r) => r.data.data.ticket),
  remove: (id) => api.delete(`/tickets/${id}`),
};
