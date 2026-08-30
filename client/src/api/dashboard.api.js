import api from './axios';

export const dashboardApi = {
  getStats: (signal) => api.get('/dashboard/stats', { signal }).then((r) => r.data.data),
  getAgentWorkload: (signal) => api.get('/dashboard/agent-workload', { signal }).then((r) => r.data.data.workload),
};
