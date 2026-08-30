import api from './axios';

export const usersApi = {
  listAgents: (signal) => api.get('/users/agents', { signal }).then((r) => r.data.data.agents),
  listAll: (params, signal) => api.get('/users', { params, signal }).then((r) => r.data.data.users),
  getById: (id) => api.get(`/users/${id}`).then((r) => r.data.data.user),
  create: (payload) => api.post('/users', payload).then((r) => r.data.data.user),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role }).then((r) => r.data.data.user),
  setActive: (id, isActive) =>
    api.patch(`/users/${id}/status`, { isActive }).then((r) => r.data.data.user),
  deactivate: (id) => api.patch(`/users/${id}/deactivate`).then((r) => r.data.data),
  reactivate: (id) => api.patch(`/users/${id}/reactivate`).then((r) => r.data.data.user),
};
