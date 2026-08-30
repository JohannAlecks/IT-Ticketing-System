import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit.api';
import { useAuth } from '../context/AuthContext';
import { protectedQueryKeys } from '../query/protectedCache';

export function useAuditEvents(filters) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({ queryKey: [...protectedQueryKeys.auditEvents(userId), filters], queryFn: ({ signal }) => auditApi.list(filters, signal), enabled: !!userId });
}
