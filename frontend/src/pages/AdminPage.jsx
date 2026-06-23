import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import GroupIcon from '@mui/icons-material/Group';
import ApartmentIcon from '@mui/icons-material/Apartment';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import StatusBadge from '../components/StatusBadge';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { formatEnum, missingReportingAuthorityText, panelApiPrefix } from '../utils/constants';

const lifecycleRoleCodes = ['SYSTEM_ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'];
const emptyResponsibilities = { total: 0, items: [] };
const adminRadius = {
  panel: 2,
  card: 1.5,
  control: 1.25,
  modal: 2,
};
const employeeSortAccessors = {
  full_name: (row) => row.full_name || '',
  employee_id: (row) => row.employee_id || '',
  department_name: (row) => row.department_name || '',
  role_name: (row) => row.role_name || '',
  reporting_manager_name: (row) => row.reporting_manager_name || '',
  status: (row) => row.status || '',
  created_at: (row) => row.created_at || '',
};

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function compareRows(a, b, sortBy) {
  const accessor = employeeSortAccessors[sortBy] || employeeSortAccessors.full_name;
  return String(accessor(a)).localeCompare(String(accessor(b)), undefined, { numeric: true, sensitivity: 'base' });
}

function roleTone(roleCode) {
  if (roleCode === 'SYSTEM_ADMIN') return { color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' };
  if (roleCode === 'DEPARTMENT_HEAD') return { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' };
  if (roleCode === 'IT_HEAD') return { color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
  if (roleCode === 'DEVELOPER') return { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' };
  if (roleCode === 'QA') return { color: '#A16207', bg: '#FEF9C3', border: '#FDE68A' };
  return { color: '#334155', bg: '#F1F5F9', border: '#CBD5E1' };
}

function useAdminColors() {
  const theme = useTheme();
  return {
    theme,
    surface: theme.custom.semantic.elevated,
    paper: theme.custom.semantic.paper,
    paperSoft: theme.custom.semantic.paperSoft,
    border: theme.custom.semantic.border,
    borderSoft: theme.custom.semantic.borderSoft,
    text: theme.palette.text.primary,
    muted: theme.palette.text.secondary,
    primary: theme.palette.primary.main,
    success: theme.palette.success.main,
    danger: theme.palette.error.main,
    warning: theme.palette.warning.main,
    shadow: theme.palette.mode === 'dark' ? '0 16px 36px rgba(0,0,0,0.28)' : '0 12px 34px rgba(15,23,42,0.06)',
  };
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [roleAccessRequests, setRoleAccessRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [approval, setApproval] = useState({});
  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '', description: '' });
  const [departmentAction, setDepartmentAction] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [departmentMenuAnchor, setDepartmentMenuAnchor] = useState(null);
  const [employeeTab, setEmployeeTab] = useState('ACTIVE');
  const [selectedUser, setSelectedUser] = useState(null);
  const [dialogAction, setDialogAction] = useState('');
  const [lifecycleForm, setLifecycleForm] = useState({});
  const [responsibilities, setResponsibilities] = useState(emptyResponsibilities);
  const [loadingResponsibilities, setLoadingResponsibilities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const [registrationRows, roleAccessRows, userRows, departmentRows, roleRows] = await Promise.all([
      api.get(`${panelApiPrefix}/registrations?status=PENDING_APPROVAL`),
      api.get(`${panelApiPrefix}/role-access-requests?status=PENDING`),
      api.get('/users'),
      api.get('/departments'),
      api.get('/users/roles'),
    ]);
    setRegistrations(registrationRows);
    setRoleAccessRequests(roleAccessRows);
    setUsers(userRows);
    setDepartments(departmentRows);
    setRoles(roleRows);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const activeUsers = useMemo(() => users.filter((item) => item.status === 'ACTIVE'), [users]);
  const inactiveUsers = useMemo(() => users.filter((item) => item.status === 'INACTIVE'), [users]);
  const lifecycleRoles = useMemo(() => roles.filter((role) => lifecycleRoleCodes.includes(role.code)), [roles]);
  const reportingAuthorities = useMemo(
    () => activeUsers.filter((item) => ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'].includes(item.role_code)),
    [activeUsers],
  );
  const developers = useMemo(() => activeUsers.filter((item) => item.role_code === 'DEVELOPER'), [activeUsers]);
  const qaUsers = useMemo(() => activeUsers.filter((item) => item.role_code === 'QA'), [activeUsers]);
  const itHeads = useMemo(() => activeUsers.filter((item) => ['IT_HEAD', 'SYSTEM_ADMIN'].includes(item.role_code)), [activeUsers]);
  const approvalQueue = useMemo(() => {
    const registrationItems = registrations.map((row) => ({ ...row, queueType: 'REGISTRATION', sortDate: row.created_at }));
    const roleItems = roleAccessRequests.map((row) => ({ ...row, queueType: 'ROLE_ACCESS', sortDate: row.created_at }));
    return [...registrationItems, ...roleItems].sort(
      (a, b) => new Date(b.sortDate || 0).getTime() - new Date(a.sortDate || 0).getTime(),
    );
  }, [registrations, roleAccessRequests]);

  async function approve(registrationId) {
    const payload = approval[registrationId];
    if (!payload?.departmentId || !payload?.roleId) {
      setError('Choose a confirmed department and role before approval.');
      return;
    }
    try {
      setError('');
      await api.post(`${panelApiPrefix}/registrations/${registrationId}/approve`, payload);
      setMessage('Registration approved.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to approve registration.');
    }
  }

  async function reject(registrationId) {
    try {
      setError('');
      await api.post(`${panelApiPrefix}/registrations/${registrationId}/reject`, { reason: 'Rejected by admin during review.' });
      setMessage('Registration rejected.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to reject registration.');
    }
  }

  async function approveRoleAccess(requestId) {
    try {
      setError('');
      await api.post(`${panelApiPrefix}/role-access-requests/${requestId}/approve`);
      setMessage('Additional role access approved.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to approve role access request.');
    }
  }

  async function rejectRoleAccess(requestId) {
    try {
      setError('');
      await api.post(`${panelApiPrefix}/role-access-requests/${requestId}/reject`, { reason: 'Rejected by admin during review.' });
      setMessage('Additional role access request rejected.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to reject role access request.');
    }
  }

  async function createDepartment(event) {
    event.preventDefault();
    await api.post('/departments', {
      ...departmentForm,
      departmentHeadUserId: departmentForm.departmentHeadUserId || null,
      status: departmentForm.status || 'ACTIVE',
    });
    setDepartmentForm({ name: '', code: '', description: '' });
    setMessage('Department created.');
    await load();
  }

  function openDepartmentDialog(action, department = null) {
    setDepartmentAction(action);
    setSelectedDepartment(department);
    setDepartmentMenuAnchor(null);
    setDepartmentForm(department ? {
      name: department.name || '',
      code: department.code || '',
      description: department.description || '',
      departmentHeadUserId: department.department_head_user_id || '',
      status: department.status || 'ACTIVE',
    } : { name: '', code: '', description: '', departmentHeadUserId: '', status: 'ACTIVE' });
  }

  function closeDepartmentDialog() {
    setDepartmentAction('');
    setSelectedDepartment(null);
    setDepartmentMenuAnchor(null);
    setDepartmentForm({ name: '', code: '', description: '' });
  }

  async function submitDepartmentDialog(event) {
    event.preventDefault();
    const payload = {
      name: departmentForm.name,
      code: departmentForm.code,
      description: departmentForm.description || null,
      departmentHeadUserId: departmentForm.departmentHeadUserId || null,
      status: departmentForm.status || 'ACTIVE',
    };
    if (departmentAction === 'create') {
      await api.post('/departments', payload);
      setMessage('Department created.');
    } else if (departmentAction === 'edit') {
      await api.patch(`/departments/${selectedDepartment.id}`, payload);
      setMessage('Department updated.');
    } else if (departmentAction === 'head') {
      await api.patch(`/departments/${selectedDepartment.id}/head`, { departmentHeadUserId: payload.departmentHeadUserId });
      setMessage('Department head changed.');
    }
    closeDepartmentDialog();
    await load();
  }

  async function toggleDepartmentStatus(department) {
    const nextAction = department.status === 'ACTIVE' ? 'deactivate' : 'activate';
    await api.post(`/departments/${department.id}/${nextAction}`);
    setDepartmentMenuAnchor(null);
    setSelectedDepartment(null);
    setMessage(`Department ${nextAction === 'activate' ? 'activated' : 'deactivated'}.`);
    await load();
  }

  function setApprovalField(id, field, value) {
    setApproval((current) => ({
      ...current,
      [id]: { ...current[id], [field]: Number(value) },
    }));
  }

  function setLifecycleField(field, value) {
    setLifecycleForm((current) => ({ ...current, [field]: value }));
  }

  async function openLifecycleDialog(action, user) {
    setError('');
    setSelectedUser(user);
    setDialogAction(action);
    setResponsibilities(emptyResponsibilities);
    setLifecycleForm({
      fullName: user.full_name || '',
      mobileNumber: user.mobile_number || '',
      designation: user.designation || '',
      roleId: user.role_id || '',
      departmentId: user.department_id || '',
      reportingManagerUserId: user.reporting_manager_user_id || '',
      replacementDepartmentHeadUserId: '',
      currentAssigneeUserId: '',
      itHeadUserId: '',
      developerUserId: '',
      qaUserId: '',
    });

    if (['view', 'reassign', 'deactivate', 'change-role', 'change-department'].includes(action)) {
      setLoadingResponsibilities(true);
      try {
        const summary = await api.get(`/users/${user.id}/responsibilities`);
        setResponsibilities(summary);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingResponsibilities(false);
      }
    }
  }

  function closeLifecycleDialog() {
    setSelectedUser(null);
    setDialogAction('');
    setLifecycleForm({});
    setResponsibilities(emptyResponsibilities);
    setLoadingResponsibilities(false);
  }

  async function submitLifecycleAction() {
    if (!selectedUser) return;
    setError('');
    try {
      if (dialogAction === 'edit') {
        await api.patch(`/users/${selectedUser.id}`, {
          fullName: lifecycleForm.fullName,
          mobileNumber: lifecycleForm.mobileNumber || null,
          designation: lifecycleForm.designation || null,
        });
        setMessage('Employee profile updated.');
      } else if (dialogAction === 'change-role') {
        await api.post(`/users/${selectedUser.id}/change-role`, {
          roleId: lifecycleForm.roleId,
          replacementDepartmentHeadUserId: lifecycleForm.replacementDepartmentHeadUserId || null,
        });
        setMessage('Role changed successfully.');
      } else if (dialogAction === 'change-department') {
        await api.post(`/users/${selectedUser.id}/change-department`, {
          departmentId: lifecycleForm.departmentId,
          reportingManagerUserId: lifecycleForm.reportingManagerUserId,
          replacementDepartmentHeadUserId: lifecycleForm.replacementDepartmentHeadUserId || null,
        });
        setMessage('Department and reporting structure updated.');
      } else if (dialogAction === 'change-manager') {
        await api.post(`/users/${selectedUser.id}/change-reporting-manager`, {
          reportingManagerUserId: lifecycleForm.reportingManagerUserId,
        });
        setMessage('Reporting manager changed.');
      } else if (dialogAction === 'reassign') {
        const summary = await api.post(`/users/${selectedUser.id}/reassign-responsibilities`, {
          departmentHeadUserId: lifecycleForm.departmentHeadUserId || null,
          currentAssigneeUserId: lifecycleForm.currentAssigneeUserId || null,
          itHeadUserId: lifecycleForm.itHeadUserId || null,
          developerUserId: lifecycleForm.developerUserId || null,
          qaUserId: lifecycleForm.qaUserId || null,
          reportingManagerUserId: lifecycleForm.reportingManagerUserId || null,
        });
        setResponsibilities(summary);
        setMessage('Active responsibilities reassigned.');
      } else if (dialogAction === 'deactivate') {
        await api.post(`/users/${selectedUser.id}/deactivate`);
        setMessage('Employee deactivated.');
      } else if (dialogAction === 'reactivate') {
        await api.post(`/users/${selectedUser.id}/reactivate`, {
          departmentId: lifecycleForm.departmentId,
          roleId: lifecycleForm.roleId,
          reportingManagerUserId: lifecycleForm.reportingManagerUserId,
        });
        setMessage('Employee reactivated.');
      }
      closeLifecycleDialog();
      await load();
    } catch (err) {
      setError(err.message);
      if (err.details?.items) {
        setResponsibilities(err.details);
        setDialogAction('deactivate');
      }
    }
  }

  return (
    <Page maxWidth={1480}>
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow="ENTERPRISE ADMINISTRATION"
          title="Admin Console"
          description="Govern users, departments, registrations, and organizational routing."
        />
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        <AdminMetricGrid
          metrics={[
            { label: 'Pending Approvals', value: approvalQueue.length, icon: <HowToRegIcon /> },
            { label: 'Active Users', value: activeUsers.length, icon: <GroupIcon /> },
            { label: 'Departments', value: departments.length, icon: <ApartmentIcon /> },
            { label: 'Roles', value: roles.length, icon: <AdminPanelSettingsIcon /> },
          ]}
        />

        <PendingApprovalsPanel
          rows={approvalQueue}
          departments={departments}
          roles={roles}
          approval={approval}
          setApprovalField={setApprovalField}
          onApproveRegistration={approve}
          onRejectRegistration={reject}
          onApproveRoleAccess={approveRoleAccess}
          onRejectRoleAccess={rejectRoleAccess}
        />

        <EmployeeManagementPanel
          users={users}
          departments={departments}
          roles={roles}
          lifecycleRoles={lifecycleRoles}
          reportingAuthorities={reportingAuthorities}
          activeUsers={activeUsers}
          inactiveUsers={inactiveUsers}
          employeeTab={employeeTab}
          loading={loading}
          onEmployeeTabChange={setEmployeeTab}
          onLifecycleAction={openLifecycleDialog}
          onReload={load}
          onMessage={setMessage}
          onError={setError}
        />

        <DepartmentManagementPanel
          departments={departments}
          menuAnchor={departmentMenuAnchor}
          selectedDepartment={selectedDepartment}
          onCreate={() => openDepartmentDialog('create')}
          onMenuOpen={(event, department) => {
            setDepartmentMenuAnchor(event.currentTarget);
            setSelectedDepartment(department);
          }}
          onMenuClose={() => {
            setDepartmentMenuAnchor(null);
            setSelectedDepartment(null);
          }}
          onAction={openDepartmentDialog}
          onToggleStatus={toggleDepartmentStatus}
        />
      </Stack>

      <DepartmentDialog
        action={departmentAction}
        department={selectedDepartment}
        form={departmentForm}
        reportingAuthorities={reportingAuthorities}
        onChange={(field, value) => setDepartmentForm((current) => ({ ...current, [field]: value }))}
        onClose={closeDepartmentDialog}
        onSubmit={submitDepartmentDialog}
      />

      <EmployeeLifecycleDialog
        action={dialogAction}
        user={selectedUser}
        form={lifecycleForm}
        responsibilities={responsibilities}
        loadingResponsibilities={loadingResponsibilities}
        roles={roles}
        lifecycleRoles={lifecycleRoles}
        departments={departments}
        reportingAuthorities={reportingAuthorities}
        activeUsers={activeUsers}
        developers={developers}
        qaUsers={qaUsers}
        itHeads={itHeads}
        onChange={setLifecycleField}
        onClose={closeLifecycleDialog}
        onSubmit={submitLifecycleAction}
      />
    </Page>
  );
}

function AdminMetricGrid({ metrics }) {
  return (
    <Grid container spacing={1.5}>
      {metrics.map((metric) => (
        <Grid key={metric.label} size={{ xs: 12, sm: 6, lg: 3 }}>
          <AdminMetricTile {...metric} />
        </Grid>
      ))}
    </Grid>
  );
}

function AdminMetricTile({ label, value, icon }) {
  const colors = useAdminColors();
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: adminRadius.card,
        border: `1px solid ${colors.borderSoft}`,
        bgcolor: colors.surface,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 36, height: 36, borderRadius: adminRadius.control, display: 'grid', placeItems: 'center', color: colors.primary, bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', border: `1px solid ${colors.borderSoft}` }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={650}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function PendingApprovalsPanel({
  rows,
  departments,
  roles,
  approval,
  setApprovalField,
  onApproveRegistration,
  onRejectRegistration,
  onApproveRoleAccess,
  onRejectRoleAccess,
}) {
  const colors = useAdminColors();
  return (
    <AdminPanel title="Pending Approvals">
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table stickyHeader sx={{ minWidth: 1180 }}>
            <TableHead>
            <TableRow>
              {['Type', 'Applicant', 'Email', 'Role Context', 'Request Date', 'Status', 'Assignment', 'Justification', 'Actions'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} sx={{ border: 0 }}>
                  <CompactEmptyState title="No Pending Approvals" message="All registration and additional role access requests have been processed." />
                </TableCell>
              </TableRow>
            ) : rows.map((row) => {
              const isRoleAccess = row.queueType === 'ROLE_ACCESS';
              const existingRoles = String(row.existing_role_codes || '')
                .split(',')
                .map((code) => code.trim())
                .filter(Boolean);
              const justification = (row.reason || '').trim();

              return (
                <TableRow key={`${row.queueType}-${row.id}`} hover sx={{ height: 68 }}>
                  <TableCell sx={{ minWidth: 170 }}>
                    <Chip
                      size="small"
                      icon={isRoleAccess ? <BadgeOutlinedIcon sx={{ fontSize: '16px !important' }} /> : <HowToRegIcon sx={{ fontSize: '16px !important' }} />}
                      label={isRoleAccess ? 'Additional Role Request' : 'New User Registration'}
                      sx={{
                        fontWeight: 700,
                        borderRadius: 999,
                        bgcolor: isRoleAccess ? 'rgba(124,58,237,0.10)' : 'rgba(37,99,235,0.10)',
                        color: isRoleAccess ? '#6D28D9' : '#1D4ED8',
                        border: `1px solid ${isRoleAccess ? 'rgba(124,58,237,0.18)' : 'rgba(37,99,235,0.18)'}`,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <EmployeeMiniIdentity name={row.full_name} caption={row.employee_id} />
                  </TableCell>
                  <TableCell sx={{ color: colors.muted, minWidth: 220 }}>{row.email}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    {isRoleAccess ? (
                      <Stack spacing={0.75}>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {existingRoles.map((code) => (
                            <Chip key={code} size="small" label={formatEnum(code)} sx={{ height: 22, fontSize: 11, fontWeight: 700 }} />
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="caption" color="text.secondary">Requested:</Typography>
                          <Chip
                            size="small"
                            label={formatEnum(row.requested_role_code) || row.requested_role_name}
                            color="primary"
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11, fontWeight: 800 }}
                          />
                        </Stack>
                      </Stack>
                    ) : (
                      <Typography variant="body2">{row.requested_department_name}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 130 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(row.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <Chip
                      size="small"
                      label={isRoleAccess ? (row.status || 'PENDING') : 'PENDING'}
                      sx={{
                        height: 22,
                        fontSize: 11,
                        fontWeight: 800,
                        bgcolor: 'rgba(245,158,11,0.12)',
                        color: '#B45309',
                        border: '1px solid rgba(245,158,11,0.22)',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    {isRoleAccess ? (
                      <Typography variant="body2" color="text.secondary">
                        {row.department_name || '—'}
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        <TextField select size="small" label="Confirm Department" value={approval[row.id]?.departmentId || ''} onChange={(e) => setApprovalField(row.id, 'departmentId', e.target.value)} fullWidth>
                          {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
                        </TextField>
                        <TextField select size="small" label="Assign Role" value={approval[row.id]?.roleId || ''} onChange={(e) => setApprovalField(row.id, 'roleId', e.target.value)} fullWidth>
                          {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
                        </TextField>
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    {isRoleAccess ? (
                      justification ? (
                        <Tooltip
                          title={(
                            <Box sx={{ maxWidth: 320 }}>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>Request reason</Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{justification}</Typography>
                            </Box>
                          )}
                          arrow
                          placement="left"
                        >
                          <IconButton size="small" aria-label="View request reason" sx={{ color: colors.primary }}>
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">No reason provided</Typography>
                      )
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 190 }}>
                    <Stack direction="row" spacing={1} sx={{ '& .MuiButton-root': { whiteSpace: 'nowrap', borderRadius: adminRadius.control } }}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => (isRoleAccess ? onApproveRoleAccess(row.id) : onApproveRegistration(row.id))}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => (isRoleAccess ? onRejectRoleAccess(row.id) : onRejectRegistration(row.id))}
                      >
                        Reject
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </AdminPanel>
  );
}

function DepartmentManagementPanel({ departments, menuAnchor, selectedDepartment, onCreate, onMenuOpen, onMenuClose, onAction, onToggleStatus }) {
  const colors = useAdminColors();
  return (
    <AdminPanel
      title="Department Management"
      action={<Button variant="contained" startIcon={<AddIcon />} onClick={onCreate} sx={{ whiteSpace: 'nowrap' }}>Add Department</Button>}
    >
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table stickyHeader sx={{ minWidth: 880 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '32%' }}>Department</TableCell>
              <TableCell sx={{ width: '12%' }}>Code</TableCell>
              <TableCell sx={{ width: '30%' }}>Department Head</TableCell>
              <TableCell sx={{ width: '14%' }}>Status</TableCell>
              <TableCell align="center" sx={{ width: 72 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ border: 0 }}>
                  <CompactEmptyState title="No Departments" message="Create a department to configure organization routing." />
                </TableCell>
              </TableRow>
            ) : departments.map((department) => (
              <TableRow key={department.id} hover sx={{ height: 68 }}>
                <TableCell>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: adminRadius.control, display: 'grid', placeItems: 'center', bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(20,184,166,0.14)' : '#ECFDF5', color: '#0F766E', border: `1px solid ${colors.borderSoft}` }}>
                      <BusinessOutlinedIcon fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{department.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{department.description || 'No description'}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell><Typography variant="body2" fontWeight={500}>{department.code}</Typography></TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{department.department_head_name || missingReportingAuthorityText}</Typography>
                  {department.department_head_email && <Typography variant="caption" color="text.secondary">{department.department_head_email}</Typography>}
                </TableCell>
                <TableCell><StatusBadge value={department.status} /></TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={(event) => onMenuOpen(event, department)} aria-label="Department actions">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={onMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, minWidth: 230, borderRadius: adminRadius.card, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper } }}
      >
        <MenuItem onClick={() => selectedDepartment && onAction('view', selectedDepartment)} sx={{ gap: 1.25 }}><VisibilityOutlinedIcon fontSize="small" />View Details</MenuItem>
        <MenuItem onClick={() => selectedDepartment && onAction('edit', selectedDepartment)} sx={{ gap: 1.25 }}><EditOutlinedIcon fontSize="small" />Edit</MenuItem>
        <MenuItem onClick={() => selectedDepartment && onAction('head', selectedDepartment)} sx={{ gap: 1.25 }}><SecurityOutlinedIcon fontSize="small" />Change Department Head</MenuItem>
        <Divider />
        <MenuItem onClick={() => selectedDepartment && onToggleStatus(selectedDepartment)} sx={{ gap: 1.25, color: selectedDepartment?.status === 'ACTIVE' ? 'error.main' : 'success.main' }}>
          {selectedDepartment?.status === 'ACTIVE' ? <ToggleOffOutlinedIcon fontSize="small" /> : <ToggleOnOutlinedIcon fontSize="small" />}
          {selectedDepartment?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </MenuItem>
      </Menu>
    </AdminPanel>
  );
}

function DepartmentDialog({ action, department, form, reportingAuthorities, onChange, onClose, onSubmit }) {
  const colors = useAdminColors();
  if (!action) return null;
  const readOnly = action === 'view';
  const title = {
    create: 'Add Department',
    edit: 'Edit Department',
    head: 'Change Department Head',
    view: 'Department Details',
  }[action];
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: adminRadius.modal, bgcolor: colors.paper } }}>
      <Box component={readOnly ? 'div' : 'form'} onSubmit={readOnly ? undefined : onSubmit}>
        <DialogTitle sx={{ fontWeight: 650 }}>{title}</DialogTitle>
        <DialogContent dividers sx={{ bgcolor: colors.paperSoft }}>
          {readOnly ? (
            <Stack spacing={1.5}>
              <ProfileField label="Department Name" value={department?.name || '-'} />
              <ProfileField label="Code" value={department?.code || '-'} />
              <ProfileField label="Department Head" value={department?.department_head_name || missingReportingAuthorityText} />
              <ProfileField label="Status" value={<StatusBadge value={department?.status} />} />
              <TextBlock label="Description" value={department?.description || 'No description'} />
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {action !== 'head' && (
                <>
                  <TextField label="Department Name" value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} required fullWidth />
                  <TextField label="Department Code" value={form.code || ''} onChange={(e) => onChange('code', e.target.value)} required fullWidth />
                  <TextField label="Description" value={form.description || ''} onChange={(e) => onChange('description', e.target.value)} multiline minRows={2} fullWidth />
                </>
              )}
              <TextField select label="Department Head" value={form.departmentHeadUserId || ''} onChange={(e) => onChange('departmentHeadUserId', e.target.value)} fullWidth>
                <MenuItem value="">No department head</MenuItem>
                {reportingAuthorities.map((person) => <MenuItem key={person.id} value={person.id}>{person.full_name} · {person.role_name}</MenuItem>)}
              </TextField>
              {action !== 'head' && (
                <TextField select label="Status" value={form.status || 'ACTIVE'} onChange={(e) => onChange('status', e.target.value)} fullWidth>
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="INACTIVE">Inactive</MenuItem>
                </TextField>
              )}
              <Alert severity="info">
                Department head changes update future routing automatically and are recorded in audit history.
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' } }}>
          <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button type="submit" variant="contained">{action === 'create' ? 'Create Department' : 'Save Changes'}</Button>}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function AdminPanel({ title, subtitle, action, children }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ borderRadius: adminRadius.panel, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.surface, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, px: { xs: 1.75, md: 2.25 }, py: 1.6, borderBottom: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={650}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action}
      </Stack>
      <Box>{children}</Box>
    </Box>
  );
}

function EmployeeMiniIdentity({ name, caption }) {
  const colors = useAdminColors();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar sx={{ width: 34, height: 34, bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', color: 'primary.main', fontWeight: 650, flexShrink: 0 }}>{name?.[0]}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{caption}</Typography>
      </Box>
    </Stack>
  );
}

function CompactEmptyState({ title, message }) {
  const colors = useAdminColors();
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }}>
      <Box sx={{ width: 42, height: 42, borderRadius: adminRadius.control, display: 'grid', placeItems: 'center', color: colors.primary, bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF', border: `1px solid ${colors.borderSoft}` }}>
        <InfoIconFallback />
      </Box>
      <Typography variant="subtitle1" fontWeight={650}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={360}>{message}</Typography>
    </Stack>
  );
}

function InfoIconFallback() {
  return <AdminPanelSettingsIcon fontSize="small" />;
}

function TextBlock({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  );
}

function UserCell({ name, caption }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar sx={{ width: 34, height: 34, bgcolor: '#DBEAFE', color: 'primary.main', fontWeight: 800, flexShrink: 0 }}>{name?.[0]}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={800} noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caption}</Typography>
      </Box>
    </Stack>
  );
}

function EmployeeIdentityCell({ user }) {
  const colors = useAdminColors();
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <Avatar
        sx={{
          width: 44,
          height: 44,
          bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF',
          color: colors.primary,
          fontSize: 15,
          fontWeight: 900,
          flexShrink: 0,
          border: `1px solid ${colors.borderSoft}`,
        }}
      >
        {user.full_name?.[0]}
      </Avatar>
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Typography sx={{ color: colors.text, fontSize: 15, fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {user.full_name}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: colors.muted, fontWeight: 500, lineHeight: 1.25 }}>
          {user.employee_id}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: colors.muted, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {user.email}
        </Typography>
      </Box>
    </Stack>
  );
}

const employeeColors = {
  primary: '#2563EB',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
};

function EmployeeManagementPanel({
  users,
  departments,
  roles,
  lifecycleRoles,
  reportingAuthorities,
  activeUsers,
  inactiveUsers,
  employeeTab,
  loading,
  onEmployeeTabChange,
  onLifecycleAction,
  onReload,
  onMessage,
  onError,
}) {
  const theme = useTheme();
  const colors = useAdminColors();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuUser, setMenuUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileResponsibilities, setProfileResponsibilities] = useState(emptyResponsibilities);
  const [profileLoading, setProfileLoading] = useState(false);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);

  const tabUsers = employeeTab === 'ACTIVE' ? activeUsers : inactiveUsers;
  const filteredUsers = useMemo(() => {
    const source = statusFilter === 'ALL' ? tabUsers : users.filter((user) => user.status === statusFilter);
    const query = search.trim().toLowerCase();
    const queryTokens = query.split(/\s+/).filter(Boolean);
    return source.filter((user) => {
      const searchable = [
        user.full_name,
        user.employee_id,
        user.email,
        user.department_name,
        user.role_name,
        user.reporting_manager_name,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || queryTokens.every((token) => searchable.includes(token));
      return matchesSearch
        && (!departmentFilter || String(user.department_id) === String(departmentFilter))
        && (!roleFilter || String(user.role_id) === String(roleFilter));
    });
  }, [departmentFilter, employeeTab, roleFilter, search, statusFilter, tabUsers, users]);

  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers].sort((a, b) => compareRows(a, b, sortBy));
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredUsers, sortBy, sortDirection]);

  const pagedUsers = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedUsers.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, sortedUsers]);

  useEffect(() => {
    setPage(0);
  }, [departmentFilter, employeeTab, roleFilter, search, statusFilter]);

  function resetFilters() {
    setSearch('');
    setDepartmentFilter('');
    setRoleFilter('');
    setStatusFilter('ALL');
  }

  function requestSort(key) {
    if (sortBy === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortDirection('asc');
  }

  function openMenu(event, user) {
    setMenuAnchor(event.currentTarget);
    setMenuUser(user);
  }

  function closeMenu() {
    setMenuAnchor(null);
    setMenuUser(null);
  }

  async function openProfile(user) {
    closeMenu();
    setProfileUser(user);
    setProfileResponsibilities(emptyResponsibilities);
    setProfileLoading(true);
    try {
      setProfileResponsibilities(await api.get(`/users/${user.id}/responsibilities`));
    } catch (err) {
      onError(err.message);
    } finally {
      setProfileLoading(false);
    }
  }

  async function runRowAction(action) {
    if (!menuUser) return;
    const user = menuUser;
    closeMenu();
    if (action === 'reset-password') {
      try {
        await api.post(`${panelApiPrefix}/users/${user.id}/reset-password`, { password: 'Password123!' });
        onMessage(`Password reset for ${user.full_name}. Temporary password: Password123!`);
      } catch (err) {
        onError(err.message);
      }
      return;
    }
    if (action === 'delete') {
      onError('Employees are deactivated, not permanently deleted, so historical records remain intact.');
      return;
    }
    onLifecycleAction(action, user);
  }

  function exportRows(rowsToExport = sortedUsers) {
    const headers = ['Employee Name', 'Employee ID', 'Email', 'Department', 'Role', 'Status', 'Created Date'];
    const csvRows = rowsToExport.map((user) => [
      user.full_name,
      user.employee_id,
      user.email,
      user.department_name,
      user.role_name,
      user.status,
      formatDate(user.created_at),
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employees.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: colors.paperSoft,
        borderRadius: adminRadius.panel,
        border: `1px solid ${colors.borderSoft}`,
        overflow: 'hidden',
      }}
    >
      <EmployeeManagementHeader
        onAdd={() => setAddDrawerOpen(true)}
        onImport={() => onError('Import is a UI entry point. Bulk import processing can be wired to a backend import endpoint when available.')}
        onExport={() => exportRows(sortedUsers)}
      />

      <Box sx={{ px: { xs: 2.5, md: 4 }, pb: 4 }}>
        <EmployeeMetricGrid
          total={users.length}
          active={activeUsers.length}
          inactive={inactiveUsers.length}
        />

        <EmployeeFilterToolbar
          search={search}
          departmentFilter={departmentFilter}
          roleFilter={roleFilter}
          statusFilter={statusFilter}
          departments={departments}
          roles={roles}
          onSearch={setSearch}
          onDepartment={setDepartmentFilter}
          onRole={setRoleFilter}
          onStatus={setStatusFilter}
        />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', mt: 3, mb: 2 }}>
          <Tabs
            value={employeeTab}
            onChange={(_event, value) => onEmployeeTabChange(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 40,
              '& .MuiTabs-indicator': { height: 2, borderRadius: 8, bgcolor: colors.primary },
              '& .MuiTab-root': { minHeight: 40, px: 2, fontSize: 13, fontWeight: 600, color: colors.muted, textTransform: 'none' },
              '& .Mui-selected': { color: `${colors.primary} !important` },
            }}
          >
            <Tab value="ACTIVE" label={`Active (${activeUsers.length})`} />
            <Tab value="INACTIVE" label={`Inactive (${inactiveUsers.length})`} />
          </Tabs>
          <Typography variant="body2" sx={{ color: colors.muted, fontWeight: 500 }}>
            Showing {pagedUsers.length} of {filteredUsers.length} employees
          </Typography>
        </Stack>

        <Box
          sx={{
            borderRadius: adminRadius.panel,
            border: `1px solid ${colors.borderSoft}`,
            bgcolor: colors.paper,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            overflow: 'hidden',
          }}
        >
          {isMobile ? (
            <EmployeeMobileList
              loading={loading}
              rows={pagedUsers}
              onMenuOpen={openMenu}
            />
          ) : (
            <EmployeeTable
              loading={loading}
              rows={pagedUsers}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={requestSort}
              onMenuOpen={openMenu}
              onClearFilters={resetFilters}
              onAdd={() => setAddDrawerOpen(true)}
            />
          )}

          <TablePagination
            component="div"
            count={sortedUsers.length}
            page={page}
            onPageChange={(_event, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 15, 25, 50]}
            sx={{ px: 2, borderTop: `1px solid ${colors.borderSoft}`, '& .MuiTablePagination-toolbar': { minHeight: 52 } }}
          />
        </Box>
      </Box>

      <EmployeeActionMenu
        anchorEl={menuAnchor}
        user={menuUser}
        onClose={closeMenu}
        onView={() => menuUser && openProfile(menuUser)}
        onAction={runRowAction}
      />

      <EmployeeProfileDrawer
        user={profileUser}
        responsibilities={profileResponsibilities}
        loading={profileLoading}
        onClose={() => setProfileUser(null)}
      />

      <AddEmployeeDrawer
        open={addDrawerOpen}
        departments={departments}
        onClose={() => setAddDrawerOpen(false)}
        onCreated={async () => {
          setAddDrawerOpen(false);
          onMessage('Employee registration created. Review and approve it from Pending Registrations.');
          await onReload();
        }}
        onError={onError}
      />

    </Box>
  );
}

function EmployeeManagementHeader({ onAdd, onImport, onExport }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ p: { xs: 2, md: 2.25 }, bgcolor: colors.paper, borderBottom: `1px solid ${colors.borderSoft}` }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} sx={{ alignItems: { xs: 'stretch', lg: 'flex-start' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: colors.primary, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Workforce Administration
          </Typography>
          <Typography variant="h5" sx={{ mt: 0.5, color: colors.text, fontWeight: 650 }}>
            Employee Management
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ '& .MuiButton-root': { minHeight: 38, borderRadius: adminRadius.control, px: 1.5, whiteSpace: 'nowrap' } }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>Add Employee</Button>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={onImport}>Import Employees</Button>
          <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={onExport}>Export</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function EmployeeMetricGrid({ total, active, inactive }) {
  const metrics = [
    { label: 'Total Employees', value: total, caption: '', icon: <GroupIcon /> },
    { label: 'Active', value: active, caption: 'Enabled accounts', icon: <CheckCircleIcon /> },
    { label: 'Inactive', value: inactive, caption: 'Left organization', icon: <PersonOffOutlinedIcon /> },
  ];

  return (
    <Grid container spacing={2.5} sx={{ mt: 4 }}>
      {metrics.map((metric) => (
        <Grid key={metric.label} size={{ xs: 12, sm: 4 }}>
          <MetricTile {...metric} />
        </Grid>
      ))}
    </Grid>
  );
}

function MetricTile({ label, value, caption, icon }) {
  const colors = useAdminColors();
  return (
    <Box
      sx={{
        height: '100%',
        p: 1.6,
        borderRadius: adminRadius.card,
        border: `1px solid ${colors.borderSoft}`,
        bgcolor: colors.paper,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: colors.border,
          boxShadow: colors.shadow,
        },
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: adminRadius.control, color: colors.primary, bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF', border: `1px solid ${colors.borderSoft}`, flexShrink: 0 }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="h5" sx={{ color: colors.text, fontWeight: 650 }}>{value}</Typography>
          <Typography variant="body2" sx={{ color: colors.text, fontWeight: 500, lineHeight: 1.25 }}>{label}</Typography>
          {caption && <Typography variant="caption" sx={{ color: colors.muted }}>{caption}</Typography>}
        </Box>
      </Stack>
    </Box>
  );
}

function EmployeeFilterToolbar({
  search,
  departmentFilter,
  roleFilter,
  statusFilter,
  departments,
  roles,
  onSearch,
  onDepartment,
  onRole,
  onStatus,
}) {
  const colors = useAdminColors();
  return (
    <Box
      sx={{
        mt: 3,
        p: 1.5,
        borderRadius: adminRadius.panel,
        border: `1px solid ${colors.borderSoft}`,
        bgcolor: colors.paper,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        '& .MuiOutlinedInput-root': { minHeight: 42, borderRadius: adminRadius.control },
        '& .MuiButton-root': { minHeight: 42, borderRadius: adminRadius.control, whiteSpace: 'nowrap' },
      }}
    >
      <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, lg: 4.8 }}>
          <TextField
            placeholder="Search employees"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: colors.muted }} />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, lg: 2.05 }}>
          <TextField select label="Department" value={departmentFilter} onChange={(event) => onDepartment(event.target.value)} fullWidth>
            <MenuItem value="">All Departments</MenuItem>
            {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4, lg: 1.8 }}>
          <TextField select label="Role" value={roleFilter} onChange={(event) => onRole(event.target.value)} fullWidth>
            <MenuItem value="">All Roles</MenuItem>
            {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4, lg: 1.55 }}>
          <TextField select label="Status" value={statusFilter} onChange={(event) => onStatus(event.target.value)} fullWidth>
            <MenuItem value="ALL">Current Tab</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
            <MenuItem value="PENDING_APPROVAL">Pending</MenuItem>
          </TextField>
        </Grid>
      </Grid>
    </Box>
  );
}

function RoleBadge({ roleCode, roleName }) {
  const tone = roleTone(roleCode);
  return (
    <Chip
      size="small"
      label={roleName || 'Employee'}
      sx={{
        height: 22,
        color: tone.color,
        bgcolor: `${tone.bg}B3`,
        border: `1px solid ${tone.border}99`,
        borderRadius: 1,
        fontSize: 11.5,
        fontWeight: 600,
        minWidth: 'max-content',
        flexShrink: 0,
        '& .MuiChip-label': { px: 0.9, display: 'block' },
      }}
    />
  );
}

function EmployeeStatusBadge({ status }) {
  const colors = useAdminColors();
  const tone = {
    ACTIVE: { label: 'Active', color: colors.success },
    INACTIVE: { label: 'Inactive', color: colors.danger },
    PENDING_APPROVAL: { label: 'Pending', color: colors.warning },
  }[status] || { label: status || 'Unknown', color: colors.muted };
  return (
    <Stack direction="row" spacing={0.85} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 7, height: 7, borderRadius: 999, bgcolor: tone.color, flexShrink: 0 }} />
      <Typography variant="body2" sx={{ color: colors.text, fontWeight: 500 }}>{tone.label}</Typography>
    </Stack>
  );
}

function EmployeeTable({
  loading,
  rows,
  sortBy,
  sortDirection,
  onSort,
  onMenuOpen,
  onClearFilters,
  onAdd,
}) {
  const colors = useAdminColors();
  const columns = [
    { key: 'full_name', label: 'Employee', width: '38%' },
    { key: 'department_name', label: 'Department', width: '20%' },
    { key: 'role_name', label: 'Role', width: '16%' },
    { key: 'status', label: 'Status', width: '12%' },
    { key: 'created_at', label: 'Created Date', width: '12%' },
  ];

  return (
    <TableContainer sx={{ maxHeight: 760, overflowX: 'hidden' }}>
      <Table stickyHeader sx={{ width: '100%', tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} sx={{ width: column.width, bgcolor: colors.paperSoft, py: 1.2, px: 2, whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortBy === column.key}
                  direction={sortBy === column.key ? sortDirection : 'asc'}
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
            <TableCell align="center" sx={{ width: 64, bgcolor: colors.paperSoft, py: 1.2, px: 1.5, whiteSpace: 'nowrap' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? Array.from({ length: 7 }).map((_, index) => (
            <TableRow key={`employee-skeleton-${index}`} sx={{ height: 72 }}>
              {columns.map((column) => <TableCell key={column.key} sx={{ py: 1.5, px: 2.25 }}><Skeleton height={28} /></TableCell>)}
              <TableCell align="center"><Skeleton width={30} /></TableCell>
            </TableRow>
          )) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} sx={{ border: 0 }}>
                <EmployeeEmptyState onAdd={onAdd} onClear={onClearFilters} />
              </TableCell>
            </TableRow>
          ) : rows.map((row) => (
            <TableRow
              key={row.id}
              sx={{
                height: 72,
                transition: 'background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
                '&:hover': {
                  bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.08)' : '#F8FAFC',
                  boxShadow: `inset 3px 0 0 ${colors.primary}`,
                },
              }}
            >
              <TableCell sx={{ py: 1.5, px: 2.25, minWidth: 0 }}>
                <EmployeeIdentityCell user={row} />
              </TableCell>
              <TableCell sx={{ py: 1.5, px: 2.25, minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: colors.text, fontWeight: 500, overflowWrap: 'anywhere' }}>{row.department_name || '-'}</Typography>
              </TableCell>
              <TableCell sx={{ py: 1.5, px: 2.25, overflow: 'visible' }}><RoleBadge roleCode={row.role_code} roleName={row.role_name} /></TableCell>
              <TableCell sx={{ py: 1.5, px: 2.25 }}><EmployeeStatusBadge status={row.status} /></TableCell>
              <TableCell sx={{ py: 1.5, px: 2.25 }}>
                <Typography variant="body2" sx={{ color: colors.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatDate(row.created_at)}</Typography>
              </TableCell>
              <TableCell align="center" sx={{ py: 1.5, px: 1.25 }}>
                <IconButton
                  size="small"
                  onClick={(event) => onMenuOpen(event, row)}
                  aria-label="Employee actions"
                  sx={{ width: 34, height: 34, color: colors.muted, '&:hover': { bgcolor: colors.paperSoft, color: colors.text } }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function EmployeeEmptyState({ onAdd, onClear }) {
  const colors = useAdminColors();
  return (
    <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
      <Box sx={{ width: 48, height: 48, borderRadius: adminRadius.control, display: 'grid', placeItems: 'center', bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF', color: colors.primary, border: `1px solid ${colors.borderSoft}` }}>
        <GroupIcon />
      </Box>
      <Box>
        <Typography variant="subtitle1" sx={{ color: colors.text, fontWeight: 650 }}>No employees found</Typography>
        <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>Try clearing filters or create a new employee registration.</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {onAdd && <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} sx={{ whiteSpace: 'nowrap' }}>Add Employee</Button>}
        {onClear && <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={onClear} sx={{ whiteSpace: 'nowrap' }}>Clear Filters</Button>}
      </Stack>
    </Stack>
  );
}

function EmployeeMobileList({ loading, rows, onMenuOpen }) {
  const colors = useAdminColors();
  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      {loading ? Array.from({ length: 5 }).map((_, index) => (
        <Box key={`employee-mobile-skeleton-${index}`} sx={{ p: 2, borderRadius: adminRadius.card, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper }}>
          <Skeleton width="65%" height={28} />
          <Skeleton width="42%" />
          <Skeleton width="88%" />
        </Box>
      )) : rows.length === 0 ? (
        <EmployeeEmptyState />
      ) : rows.map((row) => (
        <Box
          key={row.id}
          sx={{
            p: 1.5,
            borderRadius: adminRadius.card,
            border: `1px solid ${colors.borderSoft}`,
            bgcolor: colors.paper,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <EmployeeIdentityCell user={row} />
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <RoleBadge roleCode={row.role_code} roleName={row.role_name} />
                <EmployeeStatusBadge status={row.status} />
              </Stack>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 1 }}>Department: {row.department_name || '-'}</Typography>
            </Box>
            <IconButton size="small" onClick={(event) => onMenuOpen(event, row)} aria-label="Employee actions">
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function EmployeeActionMenu({ anchorEl, user, onClose, onView, onAction }) {
  const colors = useAdminColors();
  const active = user?.status === 'ACTIVE';
  const itemSx = { gap: 1.25, minHeight: 40, fontWeight: 500 };
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ sx: { mt: 1, minWidth: 240, borderRadius: adminRadius.card, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper, boxShadow: colors.shadow } }}
    >
      <MenuItem onClick={onView} sx={itemSx}><VisibilityOutlinedIcon fontSize="small" />View Profile</MenuItem>
      {active ? [
        <MenuItem key="edit" onClick={() => onAction('edit')} sx={itemSx}><EditOutlinedIcon fontSize="small" />Edit Employee</MenuItem>,
        <MenuItem key="role" onClick={() => onAction('change-role')} sx={itemSx}><SecurityOutlinedIcon fontSize="small" />Change Role</MenuItem>,
        <MenuItem key="department" onClick={() => onAction('change-department')} sx={itemSx}><ApartmentIcon fontSize="small" />Change Department</MenuItem>,
        <MenuItem key="manager" onClick={() => onAction('change-manager')} sx={itemSx}><GroupIcon fontSize="small" />Change Reporting Manager</MenuItem>,
        <MenuItem key="reassign" onClick={() => onAction('reassign')} sx={itemSx}><RestartAltIcon fontSize="small" />Reassign Responsibilities</MenuItem>,
        <MenuItem key="reset" onClick={() => onAction('reset-password')} sx={itemSx}><KeyOutlinedIcon fontSize="small" />Reset Password</MenuItem>,
        <Divider key="divider" />,
        <MenuItem key="deactivate" onClick={() => onAction('deactivate')} sx={{ ...itemSx, color: colors.danger }}><PersonOffOutlinedIcon fontSize="small" />Deactivate</MenuItem>,
      ] : (
        <MenuItem onClick={() => onAction('reactivate')} sx={itemSx}><CheckCircleIcon fontSize="small" />Reactivate Employee</MenuItem>
      )}
    </Menu>
  );
}

function EmployeeProfileDrawer({ user, responsibilities, loading, onClose }) {
  const colors = useAdminColors();
  const items = responsibilities.items || [];
  const countFor = (key) => items.find((item) => item.key === key)?.count || 0;
  return (
    <Drawer anchor="right" open={Boolean(user)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 0, bgcolor: colors.paperSoft } }}>
      {user && (
        <Stack spacing={0} sx={{ height: '100%' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', p: 2.25, bgcolor: colors.paper, borderBottom: `1px solid ${colors.borderSoft}` }}>
            <Box>
              <Typography variant="caption" sx={{ color: colors.primary, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Employee Profile</Typography>
              <Typography variant="h5" sx={{ color: colors.text, fontWeight: 650 }}>{user.full_name}</Typography>
            </Box>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
          <Stack spacing={2} sx={{ p: 2.5, overflowY: 'auto' }}>
            <ProfileSection title="Employee Information">
              <ProfileField label="Name" value={user.full_name} />
              <ProfileField label="Employee ID" value={user.employee_id} />
              <ProfileField label="Email" value={user.email} />
              <ProfileField label="Department" value={user.department_name || '-'} />
              <ProfileField label="Role" value={<RoleBadge roleCode={user.role_code} roleName={user.role_name} />} />
              <ProfileField label="Reporting Manager" value={user.reporting_manager_name || missingReportingAuthorityText} />
            </ProfileSection>

            <ProfileSection title="Work Information">
              {loading ? <Skeleton height={96} /> : (
                <Grid container spacing={1}>
                  <Grid size={{ xs: 4 }}><MiniMetric label="Active Requests" value={countFor('reportedTo') + countFor('currentAssignee')} /></Grid>
                  <Grid size={{ xs: 4 }}><MiniMetric label="Assigned Reviews" value={countFor('qa')} /></Grid>
                  <Grid size={{ xs: 4 }}><MiniMetric label="Pending Tasks" value={responsibilities.total || 0} /></Grid>
                </Grid>
              )}
            </ProfileSection>

            <ProfileSection title="Audit Information">
              <ProfileField label="Created Date" value={formatDate(user.created_at)} />
              <ProfileField label="Last Updated" value={formatDate(user.updated_at)} />
              <ProfileField label="Last Login" value={formatDate(user.last_login_at)} />
              <ProfileField label="Status" value={<EmployeeStatusBadge status={user.status} />} />
            </ProfileSection>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}

function ProfileSection({ title, children }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ p: 1.75, borderRadius: adminRadius.card, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <Typography variant="subtitle2" sx={{ color: colors.text, fontWeight: 650, mb: 1.25 }}>{title}</Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

function ProfileField({ label, value }) {
  const colors = useAdminColors();
  return (
    <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" sx={{ color: colors.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography component="div" variant="body2" sx={{ color: colors.text, fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</Typography>
    </Stack>
  );
}

function MiniMetric({ label, value }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ p: 1.2, borderRadius: adminRadius.control, bgcolor: colors.paperSoft, border: `1px solid ${colors.borderSoft}` }}>
      <Typography variant="h6" sx={{ color: colors.text, fontWeight: 650 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: colors.muted, fontWeight: 500 }}>{label}</Typography>
    </Box>
  );
}

function AddEmployeeDrawer({ open, departments, onClose, onCreated, onError }) {
  const colors = useAdminColors();
  const [form, setForm] = useState({
    fullName: '',
    employeeId: '',
    email: '',
    mobileNumber: '',
    designation: 'Employee',
    departmentId: '',
    password: 'Password123!',
    confirmPassword: 'Password123!',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        fullName: '',
        employeeId: '',
        email: '',
        mobileNumber: '',
        designation: 'Employee',
        departmentId: '',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      setSubmitting(false);
      api.get('/auth/next-employee-id')
        .then((result) => setForm((current) => ({ ...current, employeeId: result.employeeId || '' })))
        .catch(() => {});
    }
  }, [open]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/register', form);
      await onCreated();
    } catch (err) {
      onError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 660 }, bgcolor: colors.paperSoft } }}>
      <Box component="form" onSubmit={submit} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', p: 2.25, bgcolor: colors.paper, borderBottom: `1px solid ${colors.borderSoft}` }}>
          <Box>
            <Typography variant="caption" sx={{ color: colors.primary, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Create Employee</Typography>
            <Typography variant="h5" sx={{ color: colors.text, fontWeight: 650 }}>Add Employee</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>Create an employee registration for admin approval.</Typography>
          </Box>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Stack>

        <Stack spacing={1.5} sx={{ p: 2, flex: 1, overflowY: 'auto', '& .MuiOutlinedInput-root': { minHeight: 42, borderRadius: adminRadius.control } }}>
          <DrawerSection title="Basic Information">
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Full Name" value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} required fullWidth /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Employee ID" value={form.employeeId} onChange={(e) => setField('employeeId', e.target.value.toUpperCase())} helperText="Auto-generated using VIO-0001 format." required fullWidth /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required fullWidth /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Mobile Number" value={form.mobileNumber} onChange={(e) => setField('mobileNumber', e.target.value)} fullWidth /></Grid>
            </Grid>
          </DrawerSection>

          <DrawerSection title="Employment Information">
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select label="Department" value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)} required fullWidth>
                  {departments.filter((department) => department.status === 'ACTIVE').map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select label="Designation" value={form.designation} onChange={(e) => setField('designation', e.target.value)} required fullWidth>
                  {['Employee', 'Department Head', 'IT Manager', 'IT Head', 'Developer', 'QA', 'System Admin / Head / CEO'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
          </DrawerSection>

          <DrawerSection title="Role & Permissions">
            <Alert severity="info">Role assignment is finalized from Pending Registrations when the admin approves this employee.</Alert>
          </DrawerSection>

          <DrawerSection title="Reporting Structure">
            <Alert severity="info">
              Reporting Manager is resolved from the selected department head during approval. If no department head exists, configure one in Department Management before routing requests.
            </Alert>
          </DrawerSection>

          <DrawerSection title="Account Settings">
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Initial Password" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} required fullWidth /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Confirm Password" type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required fullWidth /></Grid>
            </Grid>
          </DrawerSection>
        </Stack>

        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end', p: 1.75, bgcolor: colors.paper, borderTop: `1px solid ${colors.borderSoft}`, position: 'sticky', bottom: 0, '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting || !form.fullName || !form.employeeId || !form.email || !form.departmentId}>
            {submitting ? 'Creating...' : 'Create Employee'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

function DrawerSection({ title, children }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ p: 1.75, borderRadius: adminRadius.card, border: `1px solid ${colors.borderSoft}`, bgcolor: colors.paper, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <Typography variant="subtitle2" sx={{ mb: 1.25, color: colors.text, fontWeight: 650 }}>{title}</Typography>
      {children}
    </Box>
  );
}

function EmployeeLifecycleDialog({
  action,
  user,
  form,
  responsibilities,
  loadingResponsibilities,
  roles,
  lifecycleRoles,
  departments,
  reportingAuthorities,
  activeUsers,
  developers,
  qaUsers,
  itHeads,
  onChange,
  onClose,
  onSubmit,
}) {
  const colors = useAdminColors();
  if (!user || !action) return null;

  const title = {
    view: 'View Employee',
    edit: 'Edit Employee',
    'change-role': 'Change Role',
    'change-department': 'Change Department',
    'change-manager': 'Change Reporting Manager',
    reassign: 'Reassign Responsibilities',
    deactivate: 'Deactivate Employee',
    reactivate: 'Reactivate Employee',
  }[action];
  const activeResponsibilities = responsibilities.items?.filter((item) => item.count > 0) || [];
  const isDeactivateBlocked = action === 'deactivate' && responsibilities.total > 0;
  const submitLabel = {
    edit: 'Save Changes',
    'change-role': 'Change Role',
    'change-department': 'Change Department',
    'change-manager': 'Change Reporting Manager',
    reassign: 'Transfer Responsibilities',
    deactivate: 'Deactivate Employee',
    reactivate: 'Reactivate Employee',
  }[action];

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: adminRadius.modal, bgcolor: colors.paper } }}>
      <DialogTitle sx={{ fontWeight: 650 }}>{title}</DialogTitle>
      <DialogContent dividers sx={{ bgcolor: colors.paperSoft }}>
        <Stack spacing={1.5}>
          <UserSummary user={user} />

          {['view', 'reassign', 'deactivate', 'change-role', 'change-department'].includes(action) && (
            <ResponsibilitySummary responsibilities={responsibilities} loading={loadingResponsibilities} />
          )}

          {action === 'edit' && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Full Name" value={form.fullName || ''} onChange={(e) => onChange('fullName', e.target.value)} fullWidth /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><TextField label="Mobile Number" value={form.mobileNumber || ''} onChange={(e) => onChange('mobileNumber', e.target.value)} fullWidth /></Grid>
              <Grid size={{ xs: 12 }}><TextField label="Designation" value={form.designation || ''} onChange={(e) => onChange('designation', e.target.value)} fullWidth /></Grid>
            </Grid>
          )}

          {action === 'change-role' && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <SelectField label="New Role" value={form.roleId || ''} options={lifecycleRoles} getLabel={(role) => role.name} onChange={(value) => onChange('roleId', value)} />
              </Grid>
              {activeResponsibilities.some((item) => item.key === 'departmentHead') && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <SelectField label="Replacement Department Head" value={form.replacementDepartmentHeadUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('replacementDepartmentHeadUserId', value)} />
                </Grid>
              )}
            </Grid>
          )}

          {action === 'change-department' && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <SelectField label="New Department" value={form.departmentId || ''} options={departments.filter((item) => item.status === 'ACTIVE')} getLabel={(item) => item.name} onChange={(value) => onChange('departmentId', value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <SelectField label="New Reporting Manager" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('reportingManagerUserId', value)} />
              </Grid>
              {activeResponsibilities.some((item) => item.key === 'departmentHead') && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <SelectField label="Replacement Department Head" value={form.replacementDepartmentHeadUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('replacementDepartmentHeadUserId', value)} />
                </Grid>
              )}
            </Grid>
          )}

          {action === 'change-manager' && (
            <SelectField label="New Reporting Manager" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('reportingManagerUserId', value)} />
          )}

          {action === 'reassign' && (
            <ReassignmentFields
              user={user}
              form={form}
              responsibilities={activeResponsibilities}
              reportingAuthorities={reportingAuthorities}
              activeUsers={activeUsers}
              developers={developers}
              qaUsers={qaUsers}
              itHeads={itHeads}
              onChange={onChange}
            />
          )}

          {action === 'deactivate' && (
            <Alert severity={isDeactivateBlocked ? 'warning' : 'error'}>
              {isDeactivateBlocked
                ? `${user.full_name} currently owns ${responsibilities.total} active responsibility record(s). Transfer responsibilities before deactivation.`
                : `This will mark ${user.full_name} as Inactive and Left Organization. Historical records will remain unchanged.`}
            </Alert>
          )}

          {action === 'reactivate' && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <SelectField label="Department" value={form.departmentId || ''} options={departments.filter((item) => item.status === 'ACTIVE')} getLabel={(item) => item.name} onChange={(value) => onChange('departmentId', value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <SelectField label="Role" value={form.roleId || ''} options={roles} getLabel={(role) => role.name} onChange={(value) => onChange('roleId', value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <SelectField label="Reporting Manager" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('reportingManagerUserId', value)} />
              </Grid>
            </Grid>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 1.75, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
        <Button onClick={onClose}>Close</Button>
        {submitLabel && (
          <Button variant="contained" color={action === 'deactivate' ? 'error' : 'primary'} onClick={onSubmit} disabled={isDeactivateBlocked || loadingResponsibilities}>
            {submitLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function UserSummary({ user }) {
  const colors = useAdminColors();
  return (
    <Box sx={{ border: `1px solid ${colors.borderSoft}`, borderRadius: adminRadius.card, p: 1.75, bgcolor: colors.paper }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
        <Avatar sx={{ width: 42, height: 42, bgcolor: colors.theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', color: 'primary.main', fontWeight: 650 }}>{user.full_name?.[0]}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={650}>{user.full_name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={user.employee_id} />
            <Chip size="small" label={user.role_name} />
            <Chip size="small" label={user.department_name || 'No Department'} />
            <Chip size="small" label={user.status} color={user.status === 'ACTIVE' ? 'success' : 'default'} />
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function ResponsibilitySummary({ responsibilities, loading }) {
  const colors = useAdminColors();
  const activeItems = responsibilities.items?.filter((item) => item.count > 0) || [];
  return (
    <Box sx={{ border: `1px solid ${colors.borderSoft}`, borderRadius: adminRadius.card, p: 1.75, bgcolor: colors.paper }}>
      <Typography fontWeight={650}>Active Responsibility Check</Typography>
      <Typography variant="body2" color="text.secondary">
        {loading ? 'Checking active work...' : activeItems.length ? `${responsibilities.total} active responsibility record(s) must be transferred.` : 'No active responsibilities found.'}
      </Typography>
      {activeItems.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {activeItems.map((item) => (
            <Box key={item.key}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" fontWeight={600}>{item.label}</Typography>
                <Chip size="small" label={item.count} color="warning" />
              </Stack>
              {item.records?.slice(0, 3).map((record) => (
                <Typography key={`${item.key}-${record.id}`} variant="caption" color="text.secondary" display="block">
                  {record.request_number || record.name || record.full_name || `Record #${record.id}`} {record.status ? `· ${record.status}` : ''}
                </Typography>
              ))}
              <Divider sx={{ mt: 1 }} />
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ReassignmentFields({ user, form, responsibilities, reportingAuthorities, activeUsers, developers, qaUsers, itHeads, onChange }) {
  const has = (key) => responsibilities.some((item) => item.key === key);
  return (
    <Grid container spacing={2}>
      {(has('departmentHead') || has('reportedTo')) && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New Department Head / Reporting Manager" value={form.departmentHeadUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('departmentHeadUserId', value)} />
        </Grid>
      )}
      {(has('currentAssignee') || has('clarificationReturn')) && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New Workflow Owner" value={form.currentAssigneeUserId || ''} options={activeUsers.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('currentAssigneeUserId', value)} />
        </Grid>
      )}
      {has('itHead') && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New Internal Review Owner" value={form.itHeadUserId || ''} options={itHeads.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('itHeadUserId', value)} />
        </Grid>
      )}
      {has('developer') && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New Assigned Employee" value={form.developerUserId || ''} options={developers.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('developerUserId', value)} />
        </Grid>
      )}
      {has('qa') && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New QA Owner" value={form.qaUserId || ''} options={qaUsers.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('qaUserId', value)} />
        </Grid>
      )}
      {has('reportingManager') && (
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectField label="New Reporting Manager For Direct Reports" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('reportingManagerUserId', value)} />
        </Grid>
      )}
      {!responsibilities.length && (
        <Grid size={{ xs: 12 }}>
          <Alert severity="success">No active responsibilities need reassignment.</Alert>
        </Grid>
      )}
    </Grid>
  );
}

function SelectField({ label, value, options, getLabel, onChange }) {
  return (
    <TextField select label={label} value={value || ''} onChange={(event) => onChange(event.target.value)} fullWidth>
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>{getLabel(option)}</MenuItem>
      ))}
    </TextField>
  );
}
