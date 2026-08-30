import { History } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

export default function HistoryTimeline({ history }) {
  if (!history?.length) {
    return <p className="py-6 text-center text-sm text-gray-400">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {history.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100">
            <History className="h-3 w-3 text-gray-500" />
          </div>
          <div>
            <p className="text-sm text-gray-700">{entry.description}</p>
            <p className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
