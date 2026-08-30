import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onboardingApi } from '../api/onboarding.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';
export function useOnboarding() { const { user } = useAuth(); const userId = user?.id; return useQuery({ queryKey: protectedQueryKeys.onboarding(userId), queryFn: ({ signal }) => onboardingApi.get(signal), enabled: !!userId }); }
export function useUpdateOnboarding() { const client = useQueryClient(); const { user } = useAuth(); const userId = user?.id; return useMutation({ mutationKey: protectedMutationKeys.onboarding(userId), mutationFn: onboardingApi.update, onSuccess: (onboarding) => client.setQueryData(protectedQueryKeys.onboarding(userId), onboarding) }); }
