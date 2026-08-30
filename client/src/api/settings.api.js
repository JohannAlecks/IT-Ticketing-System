import api from './axios';
export const settingsApi = {
  me: async () => (await api.get('/settings/me')).data.data.user,
  updateProfile: async (payload) => (await api.patch('/settings/me', payload)).data.data.user,
  changePassword: async (payload) => api.patch('/settings/me/password', payload),
  system: async () => (await api.get('/settings/system')).data.data,
};
