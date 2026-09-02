import { useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { useAuth } from '../context/AuthContext';
import { protectedMutationKeys, protectedQueryKeys } from '../query/protectedCache';

export const NOTIFICATION_TYPES = [
  'TICKET_ASSIGNED', 'TICKET_UNASSIGNED', 'TICKET_STATUS_CHANGED',
  'TICKET_PUBLIC_REPLY', 'TICKET_WORK_BLOCKING', 'KNOWLEDGE_SUBMITTED',
  'KNOWLEDGE_PUBLISHED', 'KNOWLEDGE_RETURNED', 'ACCOUNT_REACTIVATED',
];

const ticketTypes = new Set(['TICKET_ASSIGNED', 'TICKET_UNASSIGNED', 'TICKET_STATUS_CHANGED', 'TICKET_PUBLIC_REPLY', 'TICKET_WORK_BLOCKING']);
const knowledgeTypes = new Set(['KNOWLEDGE_SUBMITTED', 'KNOWLEDGE_PUBLISHED', 'KNOWLEDGE_RETURNED']);

export const NOTIFICATION_PREFERENCE_KEYS = [
  'ticketAssigned',
  'ticketUnassigned',
  'ticketStatusChanged',
  'ticketPublicReply',
  'ticketWorkBlocking',
  'knowledgeSubmitted',
  'knowledgePublished',
  'knowledgeReturned',
];

function notificationRole(role, user) {
  return String(role || user?.role || '').toUpperCase();
}

export function normalizeNotificationFilters(filters = {}) {
  const status = String(filters.status || 'ALL').toUpperCase() === 'UNREAD' ? 'UNREAD' : 'ALL';
  const type = String(filters.type || '').toUpperCase();
  return {
    status,
    ...(NOTIFICATION_TYPES.includes(type) ? { type } : {}),
    page: Math.max(1, Number.parseInt(filters.page, 10) || 1),
    limit: Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 12)),
  };
}

export function notificationDestination(notification) {
  const safeId = (value) => typeof value === 'string' && value.trim() ? encodeURIComponent(value) : null;
  if (ticketTypes.has(notification?.type)) {
    const id = safeId(notification.ticketId);
    return id ? `/tickets/${id}` : null;
  }
  if (knowledgeTypes.has(notification?.type)) {
    const id = safeId(notification.articleId);
    return id ? `/knowledge/${id}/edit` : null;
  }
  return notification?.type === 'ACCOUNT_REACTIVATED' ? '/profile' : null;
}

function patchListData(data, updater) {
  if (!data?.notifications) return data;
  return { ...data, notifications: data.notifications.map(updater) };
}

function optimisticNotification(notification, read) {
  return notification.readAt === null || notification.readAt === undefined
    ? { ...notification, readAt: read ? new Date().toISOString() : null }
    : (read ? notification : { ...notification, readAt: null });
}

function hasNotificationRoot(queryClient, root) {
  return queryClient.getQueryCache().findAll({ queryKey: root }).length > 0;
}

function notificationReadState(queryClient, root, id) {
  const states = queryClient.getQueryCache().findAll({ queryKey: root })
    .flatMap((query) => query.state.data?.notifications || [])
    .filter((notification) => notification.id === id)
    .map((notification) => !!notification.readAt);
  return states.length ? states.some(Boolean) && !states.some((read) => !read) : undefined;
}

function useNotificationMutation(action, mutationFn, optimisticUpdate) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const activeUserId = useRef(userId);
  activeUserId.current = userId;
  const root = protectedQueryKeys.notifications(userId);

  return useMutation({
    mutationKey: protectedMutationKeys.notification(userId, action),
    mutationFn,
    onMutate: async (variables) => {
      if (!userId) return { root, userId, snapshots: [] };
      await queryClient.cancelQueries({ queryKey: root });
      const snapshots = queryClient.getQueriesData({ queryKey: root });
      optimisticUpdate(queryClient, root, variables);
      return { root, userId, snapshots };
    },
    onError: (_error, _variables, context) => {
      // A logout/account change removes this root. Do not let a late mutation
      // restore prior-account data after that cleanup.
      if (context?.userId !== activeUserId.current || !hasNotificationRoot(queryClient, context.root)) return;
      context.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.userId === activeUserId.current && hasNotificationRoot(queryClient, context.root)) {
        void queryClient.invalidateQueries({ queryKey: context.root });
      }
    },
  });
}

export function useNotifications(filters = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const normalized = useMemo(() => normalizeNotificationFilters(filters), [filters.status, filters.type, filters.page, filters.limit]);
  return useQuery({
    queryKey: [...protectedQueryKeys.notifications(userId), 'list', normalized],
    queryFn: ({ signal }) => notificationsApi.list(normalized, signal),
    enabled: !!userId,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: [...protectedQueryKeys.notifications(userId), 'unread-count'],
    queryFn: ({ signal }) => notificationsApi.unreadCount(signal),
    enabled: !!userId,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationPreferences() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = notificationRole(role, user);
  return useQuery({
    queryKey: protectedQueryKeys.notificationPreferences(userId, normalizedRole),
    queryFn: ({ signal }) => notificationsApi.getPreferences(signal),
    enabled: !!userId,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const userId = user?.id;
  const normalizedRole = notificationRole(role, user);
  const activeIdentity = useRef({ userId, role: normalizedRole });
  const latestRequest = useRef(0);
  activeIdentity.current = { userId, role: normalizedRole };
  const queryKey = protectedQueryKeys.notificationPreferences(userId, normalizedRole);

  return useMutation({
    mutationKey: protectedMutationKeys.notificationPreferences(userId, normalizedRole),
    mutationFn: (payload) => notificationsApi.updatePreferences(payload),
    onMutate: () => ({
      userId,
      role: normalizedRole,
      requestId: ++latestRequest.current,
    }),
    onSuccess: (data, _variables, context) => {
      const identity = activeIdentity.current;
      if (
        context?.userId !== identity.userId ||
        context?.role !== identity.role ||
        context?.requestId !== latestRequest.current
      ) return;
      queryClient.setQueryData(queryKey, data);
    },
  });
}

export function useMarkNotificationRead() {
  return useNotificationMutation('read', (id) => notificationsApi.markRead(id), (client, root, id) => {
    const wasRead = notificationReadState(client, root, id);
    client.setQueriesData({ queryKey: root }, (data) => patchListData(data, (item) => item.id === id ? optimisticNotification(item, true) : item));
    if (wasRead !== true) client.setQueryData([...root, 'unread-count'], (data) => data ? { ...data, unreadCount: Math.max(0, Number(data.unreadCount || 0) - 1) } : data);
  });
}

export function useMarkNotificationUnread() {
  return useNotificationMutation('unread', (id) => notificationsApi.markUnread(id), (client, root, id) => {
    const wasRead = notificationReadState(client, root, id);
    client.setQueriesData({ queryKey: root }, (data) => patchListData(data, (item) => item.id === id ? optimisticNotification(item, false) : item));
    if (wasRead !== false) client.setQueryData([...root, 'unread-count'], (data) => data ? { ...data, unreadCount: Number(data.unreadCount || 0) + 1 } : data);
  });
}

export function useMarkAllNotificationsRead() {
  return useNotificationMutation('read-all', notificationsApi.markAllRead, (client, root) => {
    client.setQueriesData({ queryKey: root }, (data) => patchListData(data, (item) => optimisticNotification(item, true)));
    client.setQueryData([...root, 'unread-count'], (data) => data ? { ...data, unreadCount: 0 } : data);
  });
}
