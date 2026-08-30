import api from './axios';

export const attachmentsApi = {
  list: (ticketId, signal) =>
    api.get(`/tickets/${ticketId}/attachments`, { signal }).then((r) => r.data.data.attachments),

  upload: (ticketId, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post(`/tickets/${ticketId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((r) => r.data.data.attachment);
  },

  // Returns a blob so the browser can save/open it with the correct
  // filename, rather than navigating to a raw authenticated URL (which
  // wouldn't carry the Authorization header anyway).
  download: (ticketId, attachmentId) =>
    api
      .get(`/tickets/${ticketId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
      .then((r) => r.data),

  remove: (ticketId, attachmentId) => api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`),
};
