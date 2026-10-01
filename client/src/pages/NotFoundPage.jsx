import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-center">
      <h1 className="text-3xl font-bold text-gray-700">Page not found (404)</h1>
      <p className="text-sm text-gray-500">This page doesn't exist.</p>
      <Button as={Link} to="/dashboard" size="sm">Back to dashboard</Button>
    </div>
  );
}
