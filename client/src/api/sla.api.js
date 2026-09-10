import api from './axios';

const unwrap = (response) => response.data.data;

export const slaApi = {
  listPolicies: (signal) => api.get('/sla/policies', { signal }).then(unwrap),
  updatePolicy: (id, payload) => api.patch(`/sla/policies/${encodeURIComponent(id)}`, payload).then((response) => unwrap(response).policy),
};
