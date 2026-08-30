import api from './axios';

export const dashboardApi = {
  getSummary: (signal) => api.get('/dashboard/summary', { signal }).then((r) => r.data.data),
  getStats: (signal) => api.get('/dashboard/stats', { signal }).then((r) => r.data.data),
  getAgentWorkload: (signal) => api.get('/dashboard/agent-workload', { signal }).then((r) => r.data.data.workload),
};
