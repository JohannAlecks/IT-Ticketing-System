import { useState } from 'react';
import { Send } from 'lucide-react';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useAddComment } from '../../hooks/useComments';
import { useAuth } from '../../context/AuthContext';

export default function CommentForm({ ticketId }) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const { role } = useAuth();
  const canPostInternal = role === 'AGENT' || role === 'ADMIN';
  const { mutate, isPending } = useAddComment(ticketId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    mutate(
      { content: content.trim(), isInternal: canPostInternal ? isInternal : false },
      { onSuccess: () => setContent('') }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Write a comment..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center justify-between">
        {canPostInternal ? (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Internal note (not visible to requester)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" isLoading={isPending} disabled={!content.trim()}>
          <Send className="h-3.5 w-3.5" /> Post
        </Button>
      </div>
    </form>
  );
}
