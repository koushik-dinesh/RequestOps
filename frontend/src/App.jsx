import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleRoute from './auth/RoleRoute';
import { routePermissions } from './auth/permissions';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import RequestsPage from './pages/RequestsPage';
import RequestCreatePage from './pages/RequestCreatePage';
import RequestDetailPage from './pages/RequestDetailPage';
import AdminPage from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';
import OrganizationDirectoryPage from './pages/OrganizationDirectoryPage';
import UserManualPage from './pages/UserManualPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route element={<RoleRoute roles={routePermissions['/requests/new']} />}>
            <Route path="/requests/new" element={<RequestCreatePage />} />
          </Route>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/organization" element={<OrganizationDirectoryPage />} />
          <Route element={<RoleRoute roles={routePermissions['/development']} />}>
            <Route path="/development" element={<RequestsPage presetStatus="IN_DEVELOPMENT" />} />
          </Route>
          <Route element={<RoleRoute roles={routePermissions['/testing']} />}>
            <Route path="/testing" element={<RequestsPage presetStatus="IN_TESTING" />} />
          </Route>
          <Route element={<RoleRoute roles={routePermissions['/uat']} />}>
            <Route path="/uat" element={<RequestsPage presetStatus="UAT_PENDING" />} />
          </Route>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/manual" element={<UserManualPage />} />
          <Route element={<RoleRoute roles={routePermissions['/admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
