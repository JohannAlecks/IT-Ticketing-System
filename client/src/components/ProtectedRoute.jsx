import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './ui/Spinner';

/**
 * Guards a route subtree behind authentication, and optionally behind a
 * list of allowed roles. Usage:
 *   <Route element={<ProtectedRoute />}>...</Route>
 *   <Route element={<ProtectedRoute roles={['ADMIN']} />}>...</Route>
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Spinner className="h-screen" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
