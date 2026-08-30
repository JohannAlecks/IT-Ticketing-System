import { Lock } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

export default function CommentList({ comments }) {
  if (!comments?.length) {
    return <p className="py-6 text-center text-sm text-gray-400">No comments yet.</p>;
  }

  return (
    <div className="space-y-4">
      {comments.map((c) => (
        <div
          key={c.id}
          className={`rounded-lg border p-3 ${
            c.isInternal ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{c.author?.name}</span>
              <span className="text-xs text-gray-400">{c.author?.role}</span>
              {c.isInternal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  <Lock className="h-2.5 w-2.5" /> Internal note
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">{formatDateTime(c.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{c.content}</p>
        </div>
      ))}
    </div>
  );
}
