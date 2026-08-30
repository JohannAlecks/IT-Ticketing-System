import api from './axios';
export const onboardingApi = { get: (signal) => api.get('/onboarding/me', { signal }).then((r) => r.data.data.onboarding), update: (payload) => api.patch('/onboarding/me', payload).then((r) => r.data.data.onboarding) };
