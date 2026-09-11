import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usersApi } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';
function useAdminQuery(kind, params) {
  const { user, role } = useAuth();
  const query = useQuery({ queryKey: [...protectedQueryKeys.users(user?.id), role, kind, params],
    queryFn: ({ signal }) => kind === 'list' ? usersApi.listAll(params, signal) : kind === 'details' ? usersApi.details(params, signal) : usersApi.summary(signal),
    enabled: Boolean(user?.id && role === 'ADMIN' && (kind !== 'details' || params)), retry: false, staleTime: 0, gcTime: 0,
  });
  return { ...query, data: role === 'ADMIN' && !query.isError ? query.data : undefined };
}
export const useUsers = (params) => useAdminQuery('list', params);
export const useUserSummary = () => useAdminQuery('summary');
export const useUserDetails = (id) => useAdminQuery('details', id);
function useUserMutation(action, fn, message) {
  const { user, role } = useAuth(); const client = useQueryClient(); const identity = `${user?.id}:${role}`; const active = useRef(identity); active.current = identity;
  useEffect(() => { active.current = identity; return () => { active.current = null; }; }, [identity]);
  return useMutation({ mutationKey: protectedMutationKeys.user(user?.id, action),
    mutationFn: (input) => { if (role !== 'ADMIN' || active.current !== identity) throw new Error('Administrator access required'); return fn(input); },
    onSuccess: async () => { if (active.current !== identity) return; await client.invalidateQueries({ queryKey: protectedQueryKeys.root(user.id) }); if (active.current === identity) toast.success(message); },
    onError: () => { if (active.current !== identity) return; void client.invalidateQueries({ queryKey: protectedQueryKeys.users(user.id) }); toast.error('Account change failed. Refresh and check your permissions before retrying.'); },
  });
}
export const useCreateUser = () => useUserMutation('create', usersApi.create, 'User created');
export const useUpdateUserRole = () => useUserMutation('update-role', ({ id, role }) => usersApi.updateRole(id, role), 'Role updated');
export const useSetUserActive = () => useUserMutation('set-active', ({ id, isActive }) => usersApi.setActive(id, isActive), 'User status updated');
export const useDeactivateUser = () => useUserMutation('deactivate', usersApi.deactivate, 'Account deactivated');
export const useReactivateUser = () => useUserMutation('reactivate', usersApi.reactivate, 'Account reactivated');
