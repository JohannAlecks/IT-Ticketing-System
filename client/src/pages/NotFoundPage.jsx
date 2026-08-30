import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-center">
      <p className="text-5xl font-bold text-gray-300">404</p>
      <p className="text-sm text-gray-500">This page doesn't exist.</p>
      <Link to="/dashboard">
        <Button size="sm">Back to dashboard</Button>
      </Link>
    </div>
  );
}
