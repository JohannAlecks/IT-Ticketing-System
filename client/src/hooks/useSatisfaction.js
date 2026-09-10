import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { satisfactionApi } from '../api/satisfaction.api';
import { protectedQueryKeys as keys } from '../query/protectedCache';

export function useSatisfaction(ticket, page = 1) {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: [...keys.satisfaction(user?.id, role), 'ticket', ticket.id, ticket.status, ticket.updatedAt, page],
    queryFn: ({ signal }) => satisfactionApi.ticket(ticket.id, { page, limit: 10 }, signal),
    enabled: !!user?.id && !!ticket.id,
    retry: false, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
}
export function useSaveSatisfaction(ticketId, cycleId) {
  const { user, role } = useAuth();
  const client = useQueryClient();
  const userId = user?.id;
  const active = useRef({ userId, role });
  active.current = { userId, role };
  return useMutation({
    mutationKey: [...keys.satisfaction(userId, role), 'mutation', ticketId, cycleId],
    mutationFn: ({ payload, token, update }) => satisfactionApi.save(ticketId, payload, token, update),
    onSuccess: async () => {
      if (active.current.userId !== userId || active.current.role !== role) return;
      // Invalidation never recreates cache entries cleared during logout.
      await Promise.all([
        keys.satisfaction(userId, role), keys.ticket(userId, ticketId, role),
        keys.dashboard(userId), keys.reports(userId), keys.notifications(userId),
      ].map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  });
}
export function useCsatReport(filters = {}, summary = false) {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: [...keys.satisfaction(user?.id, role), summary ? 'summary' : 'report', filters],
    queryFn: ({ signal }) => summary ? satisfactionApi.summary(signal) : satisfactionApi.report(filters, signal),
    enabled: !!user?.id && ['AGENT', 'ADMIN'].includes(role),
    retry: false, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
}
