import api from './axios';
export const settingsApi = {
  me: async (signal) => (await api.get('/settings/me', { signal })).data.data.user,
  updateProfile: async (payload) => (await api.patch('/settings/me', payload)).data.data.user,
  changePassword: async (payload) => api.patch('/settings/me/password', payload),
  system: async (signal) => (await api.get('/settings/system', { signal })).data.data,
};
