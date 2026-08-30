import api from './axios';

export const auditApi = {
  list: async (params, signal) => (await api.get('/audit-events', { params, signal })).data.data,
};
