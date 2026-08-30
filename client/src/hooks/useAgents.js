import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { protectedQueryKeys } from '../query/protectedCache';

export function useAgents() {
  const { role, user } = useAuth();
  const userId = user?.id;
  const canListAgents = role === 'AGENT' || role === 'ADMIN';
  return useQuery({
    queryKey: protectedQueryKeys.agents(userId),
    queryFn: ({ signal }) => usersApi.listAgents(signal),
    enabled: !!userId && canListAgents,
    staleTime: 5 * 60_000,
  });
}
