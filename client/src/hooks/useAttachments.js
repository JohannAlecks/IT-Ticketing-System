import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { attachmentsApi } from '../api/attachments.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

// Mirrors server/src/middleware/upload.js exactly — client-side validation
// is for immediate feedback only; the server re-validates size/mime/
// extension independently and is the actual security boundary.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv',
  '.zip',
];

export function validateFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File is too large. Maximum file size is 5 MB.';
  }
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return "This file type isn't supported.";
  }
  return null;
}

export function useAttachments(ticketId) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: protectedQueryKeys.attachments(userId, ticketId),
    queryFn: ({ signal }) => attachmentsApi.list(ticketId, signal),
    enabled: !!userId && !!ticketId,
  });
}

export function useUploadAttachment(ticketId) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.attachment(userId, 'upload', ticketId),
    mutationFn: ({ file, onUploadProgress }) => attachmentsApi.upload(ticketId, file, onUploadProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.attachments(userId, ticketId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, ticketId) }); // history tab shows the new entry
      toast.success('Attachment uploaded');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  });
}

export function useDeleteAttachment(ticketId) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.attachment(userId, 'delete', ticketId),
    mutationFn: (attachmentId) => attachmentsApi.remove(ticketId, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.attachments(userId, ticketId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, ticketId) });
      toast.success('Attachment removed');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove attachment'),
  });
}

export async function downloadAttachment(ticketId, attachment) {
  try {
    const blob = await attachmentsApi.download(ticketId, attachment.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.originalFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err.response?.data?.message || "Couldn't download this file");
  }
}
