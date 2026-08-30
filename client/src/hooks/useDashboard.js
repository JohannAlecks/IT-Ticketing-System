import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';
import { useAuth } from '../context/AuthContext';
import { protectedQueryKeys } from '../query/protectedCache';

export function useDashboardSummary() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: protectedQueryKeys.dashboard(userId),
    queryFn: ({ signal }) => dashboardApi.getSummary(signal),
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

export function useDashboardStats() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: [...protectedQueryKeys.dashboard(userId), 'stats'],
    queryFn: ({ signal }) => dashboardApi.getStats(signal),
    enabled: !!userId,
    refetchInterval: 60_000, // keep dashboard reasonably fresh
  });
}

export function useAgentWorkload() {
  const { role, user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: [...protectedQueryKeys.dashboard(userId), 'agent-workload'],
    queryFn: ({ signal }) => dashboardApi.getAgentWorkload(signal),
    enabled: !!userId && role === 'ADMIN', // backend also enforces this — this just avoids a wasted 403 call
  });
}
