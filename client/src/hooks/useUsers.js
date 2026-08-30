import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usersApi } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

function invalidateUserData(queryClient, userId) {
  queryClient.invalidateQueries({ queryKey: protectedQueryKeys.users(userId) });
  queryClient.invalidateQueries({ queryKey: protectedQueryKeys.agents(userId) });
}

export function useUsers(params) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: [...protectedQueryKeys.users(userId), params],
    queryFn: ({ signal }) => usersApi.listAll(params, signal),
    enabled: !!userId,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.user(userId, 'create'),
    mutationFn: usersApi.create,
    onSuccess: () => {
      invalidateUserData(queryClient, userId);
      toast.success('User created');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create user'),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.user(userId, 'update-role'),
    mutationFn: ({ id, role }) => usersApi.updateRole(id, role),
    onSuccess: () => {
      invalidateUserData(queryClient, userId);
      toast.success('Role updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update role'),
  });
}

export function useSetUserActive() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationKey: protectedMutationKeys.user(userId, 'set-active'),
    mutationFn: ({ id, isActive }) => usersApi.setActive(id, isActive),
    onSuccess: () => {
      invalidateUserData(queryClient, userId);
      toast.success('User status updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({ mutationKey: protectedMutationKeys.user(userId, 'deactivate'), mutationFn: usersApi.deactivate, onSuccess: () => { invalidateUserData(queryClient, userId); toast.success('Account deactivated'); }, onError: (err) => toast.error(err.response?.data?.message || 'Failed to deactivate account') });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({ mutationKey: protectedMutationKeys.user(userId, 'reactivate'), mutationFn: usersApi.reactivate, onSuccess: () => { invalidateUserData(queryClient, userId); toast.success('Account reactivated'); }, onError: (err) => toast.error(err.response?.data?.message || 'Failed to reactivate account') });
}
