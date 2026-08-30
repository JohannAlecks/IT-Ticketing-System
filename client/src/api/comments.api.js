import api from './axios';

export const commentsApi = {
  list: (ticketId, signal) => api.get(`/tickets/${ticketId}/comments`, { signal }).then((r) => r.data.data.comments),
  add: (ticketId, payload) =>
    api.post(`/tickets/${ticketId}/comments`, payload).then((r) => r.data.data.comment),
};
