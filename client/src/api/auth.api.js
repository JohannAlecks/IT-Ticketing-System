import api from './axios';

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }).then((r) => r.data.data),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }).then((r) => r.data.data),
  me: (signal) => api.get('/auth/me', { signal }).then((r) => r.data.data.user),
};
