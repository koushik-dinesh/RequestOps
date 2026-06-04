import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { canAccess } from './permissions';

export default function RoleRoute({ roles }) {
  const { user } = useAuth();
  return canAccess(user?.roleCode, roles) ? <Outlet /> : <Navigate to="/" replace />;
}
