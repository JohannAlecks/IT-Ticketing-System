import api from './axios';

const unwrap = (response) => response.data.data;

export const knowledgeApi = {
  list: (params, signal) => api.get('/knowledge', { params, signal }).then(unwrap),
  suggestions: (params, signal) => api.get('/knowledge/suggestions', { params, signal }).then(unwrap),
  getBySlug: (slug, signal) => api.get(`/knowledge/${encodeURIComponent(slug)}`, { signal }).then(unwrap),
  getManageById: (id, signal) => api.get(`/knowledge/manage/${encodeURIComponent(id)}`, { signal }).then(unwrap),
  create: (payload) => api.post('/knowledge', payload).then(unwrap),
  update: (id, payload) => api.patch(`/knowledge/${encodeURIComponent(id)}`, payload).then(unwrap),
  submit: (id, version) => api.patch(`/knowledge/${encodeURIComponent(id)}/submit`, { version }).then(unwrap),
  publish: (id, version) => api.patch(`/knowledge/${encodeURIComponent(id)}/publish`, { version }).then(unwrap),
  archive: (id, version) => api.patch(`/knowledge/${encodeURIComponent(id)}/archive`, { version }).then(unwrap),
  returnToDraft: (id, version, reviewNote) => api.patch(`/knowledge/${encodeURIComponent(id)}/return-to-draft`, { version, reviewNote }).then(unwrap),
  restore: (id, version, targetStatus) => api.patch(`/knowledge/${encodeURIComponent(id)}/restore`, { version, targetStatus }).then(unwrap),
  setFeedback: (id, helpful) => api.put(`/knowledge/${encodeURIComponent(id)}/feedback`, { helpful }).then(unwrap),
  removeFeedback: (id) => api.delete(`/knowledge/${encodeURIComponent(id)}/feedback`).then(unwrap),
  feedbackSummary: (id, signal) => api.get(`/knowledge/${encodeURIComponent(id)}/feedback-summary`, { signal }).then(unwrap),
};
