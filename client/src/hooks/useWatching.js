import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { watchersApi } from '../api/watchers.api';
import { useAuth } from '../context/AuthContext';
import { protectedQueryKeys } from '../query/protectedCache';
export function useWatching(id) {
  const { user, role } = useAuth();
  const query = useQuery({ queryKey: protectedQueryKeys.watching(user?.id, role, id), queryFn: ({ signal }) => watchersApi.get(id, signal),
    enabled: Boolean(user?.id && id), staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}
export function useSetWatching(id) {
  const { user, role } = useAuth(); const client = useQueryClient();
  const identity = `${user?.id}:${role}:${id}`; const active = useRef(identity); active.current = identity;
  useEffect(() => { active.current = identity; return () => { active.current = null; }; }, [identity]);
  const refresh = async () => {
    if (active.current !== identity) return;
    await Promise.all([
      protectedQueryKeys.watching(user.id, role, id), protectedQueryKeys.ticket(user.id, id, role),
      protectedQueryKeys.tickets(user.id, role), protectedQueryKeys.personal(user.id, role), protectedQueryKeys.notifications(user.id),
    ].map((queryKey) => client.invalidateQueries({ queryKey })));
  };
  // Pessimistic: no rollback can restore a previous account's state.
  return useMutation({ mutationKey: ['protected', user?.id, role, 'watching-mutation', id],
    mutationFn: (watch) => watchersApi.set({ id, watch }), onSuccess: refresh, onError: refresh,
  });
}
