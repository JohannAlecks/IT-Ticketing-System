import api from './axios';
export const searchApi = (params, mode, signal) => api.get(mode === 'quick' ? '/search' : '/search/results', { params, signal }).then((r) => r.data.data);
