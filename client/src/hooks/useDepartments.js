import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { departmentsApi } from '../api/departments.api';
import { settingsApi } from '../api/settings.api';
export function useDepartments(kind, params = {}, id) {
  const { user, role } = useAuth();
  const enabled = Boolean(user?.id && (kind === 'options' || role === 'ADMIN') && (kind !== 'members' || id));
  const query = useQuery({ queryKey: ['protected', user?.id, role, 'departments', kind, id, params], enabled,
    queryFn: ({ signal }) => kind === 'members' ? departmentsApi.members(id, params, signal) : departmentsApi[kind](params, signal), retry: false, staleTime: 0, gcTime: 0 });
  return { ...query, data: enabled && !query.isError ? query.data : undefined };
}
export function useDepartmentMutation(action) {
  const { user, role, updateUser } = useAuth(); const client = useQueryClient();
  const identity = `${user?.id}:${role}`; const active = useRef(identity); active.current = identity;
  useEffect(() => { active.current = identity; return () => { active.current = null; }; }, [identity]);
  return useMutation({ mutationKey: ['protected', user?.id, role, 'department-mutation', action],
    mutationFn: (input) => { if (role !== 'ADMIN' || active.current !== identity) throw new Error('Administrator access required'); return departmentsApi[action](input); },
    onSuccess: async (data) => {
      if (active.current !== identity) return;
      const refreshed = await settingsApi.me();
      if (active.current === identity) await updateUser(refreshed);
      if (active.current === identity) await client.invalidateQueries({ queryKey: ['protected', user.id] });
    },
    onError: () => { if (active.current === identity) void client.invalidateQueries({ queryKey: ['protected', user.id, role, 'departments'] }); },
  });
}
