import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { commentsApi } from '../api/comments.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

export function useComments(ticketId) {
  const { user, role } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: protectedQueryKeys.comments(userId, ticketId, role),
    queryFn: ({ signal }) => commentsApi.list(ticketId, signal),
    enabled: !!userId && !!ticketId,
  });
}

export function useAddComment(ticketId) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.comment(userId, ticketId, role),
    mutationFn: (payload) => commentsApi.add(ticketId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.comments(userId, ticketId, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, ticketId, role) });
      toast.success('Comment added');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add comment'),
  });
}
