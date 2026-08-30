import { AlertTriangle } from 'lucide-react';

export default function ErrorState({ message = 'Something went wrong. Please try again.' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-12 px-6 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
      <p className="text-sm font-medium text-red-700">{message}</p>
    </div>
  );
}
