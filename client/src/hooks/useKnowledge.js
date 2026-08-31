import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '../api/knowledge.api';
import { useAuth } from '../context/AuthContext';
import { isConflictError, protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

const staffRoles = new Set(['AGENT', 'ADMIN']);
const cleanText = (value) => String(value ?? '').trim();
const roleKey = (role) => String(role || '').toUpperCase();

export function normalizeKnowledgeFilters(filters = {}, scope = 'read') {
  const normalized = { scope };
  const search = cleanText(filters.search);
  const category = cleanText(filters.category).toUpperCase();
  const status = cleanText(filters.status).toUpperCase();
  const visibility = cleanText(filters.visibility).toUpperCase();
  const sort = cleanText(filters.sort).toLowerCase();
  if (search) normalized.search = search;
  if (category) normalized.category = category;
  if (scope === 'manage' && status) normalized.status = status;
  if (scope === 'manage' && visibility) normalized.visibility = visibility;
  normalized.sort = sort === 'updated' ? 'updated' : 'published';
  normalized.page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  normalized.limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 12));
  return normalized;
}

function knowledgeRoot(userId, role) {
  return protectedQueryKeys.knowledge(userId, roleKey(role));
}

export function useKnowledgeList(filters, scope = 'read') {
  const { user, role } = useAuth();
  const normalizedRole = roleKey(role);
  const userId = user?.id;
  const normalized = normalizeKnowledgeFilters(filters, scope);
  const canManage = staffRoles.has(normalizedRole);
  return useQuery({
    queryKey: [...knowledgeRoot(userId, normalizedRole), 'list', normalized],
    queryFn: ({ signal }) => knowledgeApi.list(normalized, signal),
    enabled: !!userId && (scope === 'read' || canManage),
  });
}

export function useKnowledgeArticle(slug) {
  const { user, role } = useAuth();
  const normalizedRole = roleKey(role);
  const userId = user?.id;
  return useQuery({
    queryKey: [...knowledgeRoot(userId, normalizedRole), 'detail', slug],
    queryFn: ({ signal }) => knowledgeApi.getBySlug(slug, signal),
    enabled: !!userId && !!slug,
    select: (data) => data.article,
  });
}

export function useManagedKnowledgeArticle(id) {
  const { user, role } = useAuth();
  const normalizedRole = roleKey(role);
  const userId = user?.id;
  return useQuery({
    queryKey: [...knowledgeRoot(userId, normalizedRole), 'manage-detail', id],
    queryFn: ({ signal }) => knowledgeApi.getManageById(id, signal),
    enabled: !!userId && !!id && staffRoles.has(normalizedRole),
    select: (data) => data.article,
  });
}

export function useKnowledgeSuggestions({ category, search, limit = 3 } = {}, enabled = true) {
  const { user, role } = useAuth();
  const normalizedRole = roleKey(role);
  const userId = user?.id;
  const normalizedCategory = cleanText(category).toUpperCase();
  const normalizedSearch = cleanText(search);
  const params = { category: normalizedCategory, limit: Math.min(5, Math.max(1, limit)) };
  if (normalizedSearch) params.search = normalizedSearch;
  return useQuery({
    queryKey: [...knowledgeRoot(userId, normalizedRole), 'suggestions', params],
    queryFn: ({ signal }) => knowledgeApi.suggestions(params, signal),
    enabled: !!userId && !!normalizedCategory && enabled,
    select: (data) => data.articles || [],
  });
}

export function useKnowledgeFeedbackSummary(id) {
  const { user, role } = useAuth();
  const normalizedRole = roleKey(role);
  const userId = user?.id;
  return useQuery({
    queryKey: [...knowledgeRoot(userId, normalizedRole), 'feedback-summary', id],
    queryFn: ({ signal }) => knowledgeApi.feedbackSummary(id, signal),
    enabled: !!userId && !!id && normalizedRole === 'ADMIN',
  });
}

async function invalidateKnowledge(queryClient, userId, role) {
  await queryClient.invalidateQueries({ queryKey: knowledgeRoot(userId, role) });
}

function useKnowledgeMutation(action, mutationFn) {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = roleKey(role);
  return useMutation({
    mutationKey: protectedMutationKeys.knowledge(userId, normalizedRole, action),
    mutationFn,
    onSuccess: () => invalidateKnowledge(queryClient, userId, normalizedRole),
    onError: (error) => {
      if (isConflictError(error)) void invalidateKnowledge(queryClient, userId, normalizedRole);
    },
  });
}

export const useCreateKnowledgeArticle = () => useKnowledgeMutation('create', knowledgeApi.create);
export const useUpdateKnowledgeArticle = (id) => useKnowledgeMutation('update', (payload) => knowledgeApi.update(id, payload));
export function useKnowledgeWorkflow() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = roleKey(role);
  return useMutation({
    mutationKey: protectedMutationKeys.knowledge(userId, normalizedRole, 'workflow'),
    mutationFn: ({ action, id, version, reviewNote, targetStatus }) => {
      if (action === 'submit') return knowledgeApi.submit(id, version);
      if (action === 'publish') return knowledgeApi.publish(id, version);
      if (action === 'archive') return knowledgeApi.archive(id, version);
      if (action === 'return-to-draft') return knowledgeApi.returnToDraft(id, version, reviewNote);
      return knowledgeApi.restore(id, version, targetStatus);
    },
    onSuccess: () => invalidateKnowledge(queryClient, userId, normalizedRole),
    onError: (error) => {
      if (isConflictError(error)) void invalidateKnowledge(queryClient, userId, normalizedRole);
    },
  });
}
export const useKnowledgeFeedback = (id) => useKnowledgeMutation('feedback', ({ helpful }) => knowledgeApi.setFeedback(id, helpful));
export const useRemoveKnowledgeFeedback = (id) => useKnowledgeMutation('remove-feedback', () => knowledgeApi.removeFeedback(id));

export function knowledgeErrorMessage(error, fallback = 'Could not save this knowledge article.') {
  if (isConflictError(error)) return 'This article was changed by another user. The latest data has been loaded.';
  return error?.response?.data?.message || fallback;
}
