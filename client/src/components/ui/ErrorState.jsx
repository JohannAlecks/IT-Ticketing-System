import { AlertTriangle } from 'lucide-react';
import Button from './Button';

export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry, retrying = false }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-12 px-6 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" size="sm" onClick={onRetry} isLoading={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </div>
  );
}
