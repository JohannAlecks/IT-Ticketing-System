import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { searchApi } from '../api/search.api';
import { protectedQueryKeys } from '../query/protectedCache';
export const normalizeSearch = (value) => String(value || '').trim().replace(/\s+/gu, ' ');
export const validSearch = (value) => value.length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(value) && (value.match(/[\p{L}\p{N}]/gu) || []).length >= 2;
export function useSearch(params, mode = 'quick', enabled = true) {
  const { user, role } = useAuth();
  const client = useQueryClient();
  const canSearch = Boolean(enabled && user?.id && validSearch(params.q || ''));
  // A closed dropdown must detach from its query, not keep a disabled observer
  // (and sensitive result data) alive for the remainder of the session.
  const queryKey = [...protectedQueryKeys.search(user?.id, role), mode, canSearch ? { ...params, q: normalizeSearch(params.q) } : { inactive: true }];
  const serialized = JSON.stringify(queryKey);
  useEffect(() => () => { client.cancelQueries({ queryKey: JSON.parse(serialized), exact: true }); }, [client, serialized, canSearch]);
  // Relevant in-session mutations must invalidate search as well. Cross-account
  // completions cannot touch this account's cache. No new mutation rules.
  useEffect(() => client.getMutationCache().subscribe((event) => {
    const key = event.mutation?.options.mutationKey;
    if (event.type === 'updated' && event.action?.type === 'success' && key?.[0] === 'protected' && key[1] === user?.id) {
      client.invalidateQueries({ queryKey: protectedQueryKeys.search(user.id, role) });
    }
  }), [client, user?.id, role]);
  const query = useQuery({ queryKey, queryFn: ({ signal }) => searchApi(queryKey.at(-1), mode, signal), enabled: canSearch,
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  // Never display cached permissions while a fresh authorization check runs.
  return { ...query, data: canSearch && !query.isFetching && !query.isError ? query.data : undefined };
}
