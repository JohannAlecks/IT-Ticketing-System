import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '../api/tickets.api';
import { useAuth } from '../context/AuthContext';
import {
  isConflictError,
  protectedMutationKeys,
  protectedQueryKeys,
  invalidateTicketTransitionQueries,
  refreshTicketState,
} from '../query/protectedCache';

function showTicketMutationError(error, queryClient, userId, ticketId, fallbackMessage, role) {
  if (isConflictError(error)) {
    void refreshTicketState(queryClient, userId, ticketId, role);
    toast.error('This ticket was changed by another user. The latest state has been loaded.');
    return;
  }
  toast.error(error.response?.data?.message || fallbackMessage);
}

export function useTickets(filters = {}) {
  const { user, role } = useAuth();
  const userId = user?.id;
  const archive = filters.archive === 'archived' ? 'archived' : 'active';
  const queryFilters = { ...filters, archive };
  const listRoot = protectedQueryKeys.tickets(userId, role, archive);

  return useQuery({
    queryKey: [...listRoot, queryFilters],
    queryFn: ({ signal }) => ticketsApi.list(queryFilters, signal),
    enabled: !!userId,
    // Keep the current page visible while filters/pagination change, but only
    // when the account, role, and archive boundary are unchanged. This avoids
    // flashing one account's protected tickets into another account's view.
    placeholderData: (prev, previousQuery) => {
      if (!prev) return undefined;
      const previousRoot = previousQuery?.queryKey?.slice(0, listRoot.length);
      const sameRoot = previousRoot?.length === listRoot.length
        && previousRoot.every((part, index) => part === listRoot[index]);
      return sameRoot ? prev : undefined;
    },
  });
}

export function useTicket(id) {
  const { user, role } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: protectedQueryKeys.ticket(userId, id, role),
    queryFn: ({ signal }) => ticketsApi.getById(id, signal),
    enabled: !!userId && !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'create', undefined, role),
    mutationFn: ticketsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket created');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, undefined, 'Failed to create ticket', role),
  });
}

export function useUpdateTicket(id) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'update', id, role),
    mutationFn: (payload) => ticketsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, id, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket updated');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, id, 'Failed to update ticket', role),
  });
}

export function useAssignTicket(id) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'assign', id, role),
    mutationFn: (assignedToId) => ticketsApi.assign(id, assignedToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.ticket(userId, id, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Assignment updated');
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, id, 'Failed to assign ticket', role),
  });
}

function useTicketTransition(id, action, mutationFn, successMessage, fallbackMessage) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;

  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, action, id, role),
    mutationFn,
    onSuccess: async () => {
      await invalidateTicketTransitionQueries(queryClient, userId, id, role);
      toast.success(successMessage);
    },
    onError: (err) => showTicketMutationError(err, queryClient, userId, id, fallbackMessage, role),
  });
}

export function useArchiveTicket(id) {
  return useTicketTransition(
    id,
    'archive',
    () => ticketsApi.archive(id),
    'Ticket moved to Archived',
    'Failed to archive ticket',
  );
}

export function useRestoreTicket(id) {
  return useTicketTransition(
    id,
    'restore',
    () => ticketsApi.restore(id),
    'Ticket restored to active work',
    'Failed to restore ticket',
  );
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.ticket(userId, 'delete', undefined, role),
    mutationFn: ticketsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.tickets(userId, role) });
      queryClient.invalidateQueries({ queryKey: protectedQueryKeys.dashboard(userId) });
      toast.success('Ticket deleted');
    },
    onError: (err, ticketId) => showTicketMutationError(err, queryClient, userId, ticketId, 'Failed to delete ticket', role),
  });
}
