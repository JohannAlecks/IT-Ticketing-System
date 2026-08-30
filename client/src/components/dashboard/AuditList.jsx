import { Activity } from 'lucide-react';
import { shortId, formatDateTime } from '../../utils/format';
import { DashboardEmptyState } from './DashboardStates';

const EVENT_LABELS = {
  'auth.login_succeeded': 'Signed in',
  'ticket.created': 'Created ticket',
  'ticket.updated': 'Updated ticket',
  'ticket.assigned': 'Assigned ticket',
  'ticket.unassigned': 'Unassigned ticket',
  'ticket.deleted': 'Deleted ticket',
  'ticket.comment_created': 'Added public comment',
  'ticket.internal_note_created': 'Added internal note',
  'attachment.uploaded': 'Uploaded attachment',
  'attachment.deleted': 'Deleted attachment',
  'user.created': 'Created user',
  'user.role_changed': 'Changed user role',
  'user.activated': 'Activated user',
  'user.deactivated': 'Deactivated user',
};

function eventLabel(eventType) {
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  return String(eventType || 'System activity').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AuditList({ events }) {
  const rows = Array.isArray(events) ? events : [];

  return (
    <section className="card min-w-0 p-5" aria-labelledby="admin-audit-heading">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Activity aria-hidden="true" className="h-4 w-4" />
        </div>
        <div>
          <h2 id="admin-audit-heading" className="text-base font-semibold text-slate-900">Recent audit activity</h2>
          <p className="mt-1 text-sm text-slate-500">Latest security-relevant changes across the service desk.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <DashboardEmptyState title="No recent audit activity" description="New security-relevant activity will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Recent audit activity">
          {rows.map((entry, index) => {
            const entity = [entry.entityType, entry.entityId ? shortId(entry.entityId) : null].filter(Boolean).join(' ');
            return (
              <li key={entry.id || `${entry.eventType || 'event'}-${index}`} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-slate-800">{eventLabel(entry.eventType)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{entry.actor?.name || 'System'}{entity ? ` · ${entity}` : ''}</p>
                {entry.createdAt && <time className="mt-0.5 block text-xs text-slate-400" dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
