import api from './axios';
export const departmentsApi = {
  list: (params, signal) => api.get('/departments', { params, signal }).then((r) => r.data.data),
  options: (params, signal) => api.get('/departments/options', { params, signal }).then((r) => r.data.data),
  members: (id, params, signal) => api.get(`/departments/${encodeURIComponent(id)}/members`, { params, signal }).then((r) => r.data.data),
  create: (data) => api.post('/departments', data).then((r) => r.data.data),
  update: ({ id, ...data }) => api.patch(`/departments/${encodeURIComponent(id)}/update`, data).then((r) => r.data.data),
  status: ({ id, ...data }) => api.patch(`/departments/${encodeURIComponent(id)}/status`, data).then((r) => r.data.data),
  merge: ({ id, ...data }) => api.patch(`/departments/${encodeURIComponent(id)}/merge`, data).then((r) => r.data.data),
  assign: ({ userId, ...data }) => api.patch(`/departments/users/${encodeURIComponent(userId)}`, data).then((r) => r.data.data),
};
