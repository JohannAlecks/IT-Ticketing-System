import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { emailLogsApi } from '../api/emailLogs.api';
export function useEmailLogs(params = {}, id = null) {
  const { user, role } = useAuth();
  const enabled = Boolean(user?.id && role === 'ADMIN');
  const query = useQuery({
    queryKey: ['protected', user?.id, role, 'email-logs', id ? 'detail' : 'list', id, params],
    queryFn: ({ signal }) => id ? emailLogsApi.detail(id, signal) : emailLogsApi.list(params, signal),
    enabled, retry: false, staleTime: 0, gcTime: 0,
  });
  return { ...query, data: enabled && !query.isError ? query.data : undefined };
}
