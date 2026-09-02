import { useEffect, useRef } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useMarkNotificationUnread, useNotifications, notificationDestination } from '../../hooks/useNotifications';
import NotificationItem from './NotificationItem';

export default function NotificationsDropdown({ onClose, bellRef, unreadCount: totalUnreadCount = 0 }) {
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const recent = useNotifications({ status: 'ALL', page: 1, limit: 5 });
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const markAll = useMarkAllNotificationsRead();
  const notifications = recent.data?.notifications || [];
  const unreadCount = Math.max(totalUnreadCount, notifications.filter((item) => !item.readAt).length);

  useEffect(() => {
    const initialFocus = dropdownRef.current?.querySelector('button:not(:disabled), a[href]');
    initialFocus?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        bellRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!dropdownRef.current?.contains(event.target) && !bellRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [bellRef, onClose]);

  const openNotification = async (notification) => {
    try {
      if (!notification.readAt) await markRead.mutateAsync(notification.id);
      const destination = notificationDestination(notification);
      if (destination) navigate(destination);
      onClose();
    } catch {
      // Keep the dropdown open so the user can retry if marking the notification failed.
    }
  };

  return (
    <section ref={dropdownRef} role="dialog" aria-modal="false" className="notification-panel absolute right-0 z-20 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" aria-label="Recent notifications">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
        <h2 className="font-semibold text-slate-900">Notifications</h2>
        <button type="button" onClick={() => markAll.mutate()} disabled={unreadCount === 0 || markAll.isPending} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50">Mark all read</button>
      </div>
      {recent.isLoading && <div className="space-y-3 p-4" aria-label="Loading notifications"><div className="h-4 animate-pulse rounded bg-slate-100" /><div className="h-4 animate-pulse rounded bg-slate-100" /></div>}
      {recent.isError && <div className="p-5 text-center"><p className="text-sm text-slate-600">Couldn’t load notifications.</p><button type="button" onClick={() => recent.refetch()} className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><RefreshCw className="h-4 w-4" /> Retry</button></div>}
      {!recent.isLoading && !recent.isError && notifications.length === 0 && <div className="p-6 text-center"><Bell className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm text-slate-600">You’re all caught up.</p></div>}
      {!recent.isLoading && !recent.isError && notifications.length > 0 && <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto" aria-label="Recent notification list">{notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} compact onOpen={openNotification} onToggleRead={(item) => (!item.readAt ? markRead.mutate(item.id) : markUnread.mutate(item.id))} disabled={markRead.isPending || markUnread.isPending} />)}</ul>}
      <div className="border-t border-slate-200 p-3"><Link to="/notifications" onClick={onClose} className="block rounded-lg px-2 py-1.5 text-center text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">View all notifications</Link></div>
    </section>
  );
}
