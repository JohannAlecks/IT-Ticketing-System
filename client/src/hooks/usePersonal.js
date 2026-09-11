import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { personalApi } from '../api/personal.api';
import { protectedQueryKeys } from '../query/protectedCache';
export function usePersonal(kind) {
  const { user, role } = useAuth();
  return useQuery({ queryKey: [...protectedQueryKeys.personal(user?.id, role), kind],
    queryFn: ({ signal }) => personalApi[kind](signal), enabled: Boolean(user?.id), retry: false,
    refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
}
export function useSavedTickets(id, page, limit = 15) {
  const { user, role } = useAuth();
  const root = [...protectedQueryKeys.personal(user?.id, role), 'execute', id];
  return useQuery({ queryKey: [...root, page, limit],
    queryFn: ({ signal }) => personalApi.execute(id, { page, limit }, signal), enabled: Boolean(user?.id && id), retry: false,
    refetchInterval: 60_000, refetchIntervalInBackground: false,
    placeholderData: (previous, previousQuery) => root.every((part, i) => previousQuery?.queryKey[i] === part) ? previous : undefined,
  });
}
export function usePersonalMutation(action) {
  const { user, role } = useAuth();
  const client = useQueryClient();
  const identity = `${user?.id}:${role}`;
  const active = useRef(identity);
  active.current = identity;
  useEffect(() => { active.current = identity; return () => { active.current = null; }; }, [identity]);
  return useMutation({ mutationKey: [...protectedQueryKeys.personal(user?.id, role), 'mutation', action],
    mutationFn: personalApi[action],
    onSuccess: async () => {
      if (active.current !== identity) return;
      // Invalidate only; never recreate removed data or optimistically roll back
      // another account. Drafts stay in keyed component state, not storage.
      await client.invalidateQueries({ queryKey: protectedQueryKeys.personal(user?.id, role) });
    },
  });
}
