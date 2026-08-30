import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '../api/tickets.api';
import { useAuth } from '../context/AuthContext';
import {
  isConflictError,
  protectedMutationKeys,
  protectedQueryKeys,
  refreshTicketState,
} from '../query/protectedCache';

function showTicketMutationError(error, queryClient, userId, ticketId, fallbackMessage) {
  if (isConflictError(error)) {
    void refreshTicketState(queryClient, userId, ticketId);
    toast.error('This ticket was changed by another user. The latest state has been loaded.');
    return;
  }
  toast.error(error.response?.data?.message || fallbackMessage);
}

export function useTickets(filters) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: [...protectedQueryKeys.tickets(userId), filters],
    queryFn: ({ signal }) => ticketsApi.list(filters, signal),
    enabled: !!userId,
    placeholderData: (prev) => prev, // keep old page visible while refetching (no flash)
  });
}

export function useTicket(id) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: protectedQueryKeys.ticket(userId, id),
    queryFn: ({ signal }) => ticketsApi.getById(id, signal),
    enabled: !!userId && !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'create'),
    mutationFn: ticketsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket created');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, undefined, 'Failed to create ticket'),
  });
}

export function useUpdateTicket(id) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'update', id),
    mutationFn: (payload) => ticketsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, id) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket updated');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, id, 'Failed to update ticket'),
  });
}

export function useAssignTicket(id) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'assign', id),
    mutationFn: (assignedToId) => ticketsApi.assign(id, assignedToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, id) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Assignment updated');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, id, 'Failed to assign ticket'),
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'delete'),
    mutationFn: ticketsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket deleted');
    },
    onError: (err, ticketId) => showTicketMutationError(err, queryClient, userId, ticketId, 'Failed to delete ticket'),
  });
}
