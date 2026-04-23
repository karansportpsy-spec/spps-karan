import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function AthletePortalPage() {
  const { user, role, loading, profileLoading } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-teal-50 to-emerald-50">
        <Spinner size="md" />
        <p className="text-sm text-gray-500">Loading athlete portal...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/athlete/login" state={{ from: location }} replace />;
  }

  if (role === 'athlete') {
    return <Navigate to="/athlete/dashboard" replace />;
  }

  if (role === 'practitioner') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/athlete/login" state={{ from: location }} replace />;
}
