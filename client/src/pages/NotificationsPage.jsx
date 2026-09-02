import { useState } from 'react';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Select from '../components/ui/Select';
import NotificationItem from '../components/notifications/NotificationItem';
import {
  NOTIFICATION_TYPES,
  notificationDestination,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
  useUnreadNotificationCount,
} from '../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

const typeLabels = {
  TICKET_ASSIGNED: 'Ticket assigned',
  TICKET_UNASSIGNED: 'Ticket unassigned',
  TICKET_STATUS_CHANGED: 'Ticket status changed',
  TICKET_PUBLIC_REPLY: 'Ticket public reply',
  TICKET_WORK_BLOCKING: 'Ticket work blocking',
  KNOWLEDGE_SUBMITTED: 'Knowledge submitted',
  KNOWLEDGE_PUBLISHED: 'Knowledge published',
  KNOWLEDGE_RETURNED: 'Knowledge returned',
  ACCOUNT_REACTIVATED: 'Account reactivated',
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: 'ALL', type: '', page: 1, limit: 12 });
  const notificationsQuery = useNotifications(filters);
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const markAll = useMarkAllNotificationsRead();
  const unreadQuery = useUnreadNotificationCount();
  const notifications = notificationsQuery.data?.notifications || [];
  const pagination = notificationsQuery.data?.pagination;
  const unreadCount = Math.max(
    Number(unreadQuery.data?.unreadCount || 0),
    notifications.filter((notification) => !notification.readAt).length,
  );

  const updateFilters = (changes) => setFilters((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  const openNotification = async (notification) => {
    try {
      if (!notification.readAt) await markRead.mutateAsync(notification.id);
      const destination = notificationDestination(notification);
      if (destination) navigate(destination);
    } catch {
      // Mutations roll back safely; leave the notification available for retry.
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="page-title">Notifications</h1><p className="page-subtitle">Updates about your tickets, knowledge articles, and account.</p></div>
      <Button variant="secondary" onClick={() => markAll.mutate()} disabled={unreadCount === 0} isLoading={markAll.isPending}>Mark all read</Button>
    </header>

    <div className="notification-panel card space-y-4 p-3 sm:p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Notification status">
          {['ALL', 'UNREAD'].map((status) => <button key={status} type="button" role="tab" aria-selected={filters.status === status} onClick={() => updateFilters({ status })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${filters.status === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>{status === 'ALL' ? 'All' : 'Unread'}</button>)}
        </div>
        <div className="w-full sm:w-56"><Select label="Notification type" value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })}><option value="">All types</option>{NOTIFICATION_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</Select></div>
      </div>

      {notificationsQuery.isLoading && <div className="space-y-3" aria-label="Loading notifications"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>}
      {notificationsQuery.isError && <div className="space-y-3"><ErrorState message="Couldn’t load notifications. Please try again." /><div className="text-center"><Button variant="secondary" size="sm" onClick={() => notificationsQuery.refetch()}>Retry</Button></div></div>}
      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 && <EmptyState icon={Bell} title={filters.status === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'} description="New updates will appear here." />}
      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length > 0 && <ul className="space-y-3" aria-label="Notifications">{notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onOpen={openNotification} onToggleRead={(item) => (!item.readAt ? markRead.mutate(item.id) : markUnread.mutate(item.id))} disabled={markRead.isPending || markUnread.isPending} />)}</ul>}
      {pagination?.totalPages > 1 && <nav className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Notification pages"><p className="text-sm text-slate-600">Page {pagination.page} of {pagination.totalPages} · {pagination.total} notifications</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => updateFilters({ page: pagination.page - 1 })}><ChevronLeft className="h-4 w-4" /> Previous</Button><Button variant="secondary" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => updateFilters({ page: pagination.page + 1 })}>Next <ChevronRight className="h-4 w-4" /></Button></div></nav>}
    </div>
  </div>;
}
