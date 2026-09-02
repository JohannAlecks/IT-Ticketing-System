import { Check, ExternalLink, MailOpen } from 'lucide-react';

export function relativeNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function exactNotificationTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function NotificationItem({ notification, onOpen, onToggleRead, compact = false, disabled = false }) {
  const unread = !notification.readAt;
  const exactTime = exactNotificationTime(notification.createdAt);
  return (
    <li className={`notification-item min-w-0 ${compact ? '' : 'rounded-xl border border-slate-200 bg-white'}`}>
      <div className={`flex min-w-0 items-start gap-2 ${compact ? 'px-3 py-3' : 'p-4 sm:p-5'}`}>
        <button
          type="button"
          onClick={() => onOpen(notification)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words text-sm font-semibold text-slate-900">{notification.title}</span>
            {unread && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800">Unread</span>}
          </span>
          <span className="mt-1 block break-words text-sm text-slate-600">{notification.message}</span>
          <time className="mt-2 block text-xs text-slate-500" dateTime={exactTime} title={exactTime}>{relativeNotificationTime(notification.createdAt)}</time>
        </button>
        <button
          type="button"
          onClick={() => onToggleRead(notification)}
          disabled={disabled}
          className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
          aria-label={unread ? `Mark ${notification.title} as read` : `Mark ${notification.title} as unread`}
          title={unread ? 'Mark as read' : 'Mark as unread'}
        >
          {unread ? <Check className="h-4 w-4" aria-hidden="true" /> : <MailOpen className="h-4 w-4" aria-hidden="true" />}
        </button>
        {onOpen && <ExternalLink className="mt-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
      </div>
    </li>
  );
}
