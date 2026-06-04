import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
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
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import GroupIcon from '@mui/icons-material/Group';
import ApartmentIcon from '@mui/icons-material/Apartment';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api/client';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { MetricCard, SectionCard } from '../components/Surface';
import { Page, ResponsiveToolbar } from '../components/LayoutPrimitives';
import { missingReportingAuthorityText } from '../utils/constants';

const lifecycleRoleCodes = ['SYSTEM_ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'];
const emptyResponsibilities = { total: 0, items: [] };
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
  if (roleCode === 'SYSTEM_ADMIN') return { color: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' };
  if (roleCode === 'DEPARTMENT_HEAD') return { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' };
  if (roleCode === 'IT_HEAD') return { color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' };
  if (roleCode === 'DEVELOPER') return { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' };
  if (roleCode === 'QA') return { color: '#A16207', bg: '#FEF9C3', border: '#FDE68A' };
  return { color: '#334155', bg: '#F1F5F9', border: '#CBD5E1' };
}

export default function AdminPage() {
  const [registrations, setRegistrations] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [approval, setApproval] = useState({});
  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '', description: '' });
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
    const [registrationRows, userRows, departmentRows, roleRows] = await Promise.all([
      api.get('/admin/registrations?status=PENDING_APPROVAL'),
      api.get('/users'),
      api.get('/departments'),
      api.get('/users/roles'),
    ]);
    setRegistrations(registrationRows);
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

  async function approve(registrationId) {
    const payload = approval[registrationId];
    if (!payload?.departmentId || !payload?.roleId) {
      setError('Choose a confirmed department and role before approval.');
      return;
    }
    await api.post(`/admin/registrations/${registrationId}/approve`, payload);
    setMessage('Registration approved.');
    await load();
  }

  async function reject(registrationId) {
    await api.post(`/admin/registrations/${registrationId}/reject`, { reason: 'Rejected by admin during review.' });
    setMessage('Registration rejected.');
    await load();
  }

  async function createDepartment(event) {
    event.preventDefault();
    await api.post('/departments', departmentForm);
    setDepartmentForm({ name: '', code: '', description: '' });
    setMessage('Department created.');
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
    <Page>
      <PageHeader
        eyebrow="Enterprise Administration"
        title="Admin Console"
        description="Govern users, departments, registrations, and organizational routing from one polished control plane."
        breadcrumbs={['Home', 'Admin']}
      />
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}><MetricCard label="Pending Registrations" value={registrations.length} accent="#7C3AED" icon={<HowToRegIcon />} trend="Review" /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><MetricCard label="Active Users" value={activeUsers.length} accent="#2563EB" icon={<GroupIcon />} trend="Directory" /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><MetricCard label="Departments" value={departments.length} accent="#0F766E" icon={<ApartmentIcon />} trend="Routing" /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><MetricCard label="Roles" value={roles.length} accent="#F97316" icon={<AdminPanelSettingsIcon />} trend="RBAC" /></Grid>
      </Grid>

      <SectionCard title="Pending Registrations" subtitle="Confirm department routing and assign access before activation">
        <Box sx={{ p: { xs: 1.25, md: 2.5 } }}>
          <DataTable
            rows={registrations}
            empty="No pending registrations. New employee requests will appear here for admin approval."
            minWidth={1120}
            columns={[
              { key: 'full_name', label: 'Applicant', render: (row) => <UserCell name={row.full_name} caption={row.employee_id} /> },
              { key: 'email', label: 'Email' },
              { key: 'requested_department_name', label: 'Requested Department' },
              { key: 'department', label: 'Confirm Department', render: (row) => (
                <TextField select size="small" value={approval[row.id]?.departmentId || ''} onChange={(e) => setApprovalField(row.id, 'departmentId', e.target.value)} sx={{ minWidth: 170 }}>
                  {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
                </TextField>
              ) },
              { key: 'role', label: 'Assign Role', render: (row) => (
                <TextField select size="small" value={approval[row.id]?.roleId || ''} onChange={(e) => setApprovalField(row.id, 'roleId', e.target.value)} sx={{ minWidth: 170 }}>
                  {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
                </TextField>
              ) },
              { key: 'actions', label: 'Actions', render: (row) => (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button size="small" variant="contained" onClick={() => approve(row.id)}>Approve</Button>
                  <Button size="small" color="error" variant="outlined" onClick={() => reject(row.id)}>Reject</Button>
                </Stack>
              ) },
            ]}
          />
        </Box>
      </SectionCard>

      <SectionCard title="Employee Management" subtitle="Manage employee lifecycle, role changes, reporting structure, and exits">
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
      </SectionCard>

      <SectionCard title="Department Management" subtitle="Maintain organization routing and department heads">
        <ResponsiveToolbar component="form" sx={{ p: 2.5, bgcolor: (theme) => theme.custom.semantic.paperSoft, borderBottom: '1px solid', borderColor: 'divider' }} onSubmit={createDepartment}>
          <TextField label="Department Name" value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} required />
          <TextField label="Code" value={departmentForm.code} onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })} required />
          <TextField label="Description" value={departmentForm.description} onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })} fullWidth />
          <Button type="submit" variant="contained">Create</Button>
        </ResponsiveToolbar>
        <Box sx={{ p: { xs: 1.25, md: 2.5 } }}>
          <DataTable
            rows={departments}
            minWidth={760}
            columns={[
              { key: 'name', label: 'Department', render: (row) => (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Avatar sx={{ width: 32, height: 32, bgcolor: '#CCFBF1', color: '#0F766E', fontWeight: 800 }}>{row.name?.[0]}</Avatar>
                  <Typography fontWeight={800}>{row.name}</Typography>
                </Stack>
              ) },
              { key: 'code', label: 'Code' },
              { key: 'department_head_name', label: 'Department Head', render: (row) => row.department_head_name || missingReportingAuthorityText },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
            ]}
          />
        </Box>
      </SectionCard>

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
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: '#DBEAFE', color: 'primary.main', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
        {user.full_name?.[0]}
      </Avatar>
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Typography variant="body2" fontWeight={900} noWrap sx={{ lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.full_name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.employee_id} - {user.email}
        </Typography>
      </Box>
    </Stack>
  );
}

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
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuUser, setMenuUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileResponsibilities, setProfileResponsibilities] = useState(emptyResponsibilities);
  const [profileLoading, setProfileLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState('');

  const tabUsers = employeeTab === 'ACTIVE' ? activeUsers : inactiveUsers;
  const filteredUsers = useMemo(() => {
    const source = statusFilter === 'ALL' ? tabUsers : users.filter((user) => user.status === statusFilter);
    const query = search.trim().toLowerCase();
    return source.filter((user) => {
      const matchesSearch = !query || [
        user.full_name,
        user.employee_id,
        user.email,
        user.department_name,
        user.role_name,
        user.reporting_manager_name,
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
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

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.includes(user.id)),
    [selectedIds, users],
  );

  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [departmentFilter, employeeTab, roleFilter, search, statusFilter]);

  function requestSort(key) {
    if (sortBy === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortDirection('asc');
  }

  function toggleRow(id) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function togglePageRows(checked) {
    const pageIds = pagedUsers.map((user) => user.id);
    setSelectedIds((current) => (
      checked
        ? [...new Set([...current, ...pageIds])]
        : current.filter((id) => !pageIds.includes(id))
    ));
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

  function runRowAction(action) {
    if (!menuUser) return;
    const user = menuUser;
    closeMenu();
    onLifecycleAction(action, user);
  }

  function exportSelected() {
    const headers = ['Employee Name', 'Employee ID', 'Email', 'Department', 'Role', 'Reporting Manager', 'Status', 'Created Date'];
    const rows = selectedUsers.map((user) => [
      user.full_name,
      user.employee_id,
      user.email,
      user.department_name,
      user.role_name,
      user.reporting_manager_name || missingReportingAuthorityText,
      user.status,
      formatDate(user.created_at),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'selected-employees.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectedOnPage = pagedUsers.filter((user) => selectedIds.includes(user.id)).length;
  const allPageSelected = pagedUsers.length > 0 && selectedOnPage === pagedUsers.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;

  return (
    <Box sx={{ position: 'relative' }}>
      <Box sx={{ px: { xs: 1.25, md: 2 }, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'stretch', lg: 'center' }, justifyContent: 'space-between' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ minWidth: 0 }}>
            <EmployeeStatCard label="Total Employees" value={users.length} tone="#1D4ED8" />
            <EmployeeStatCard label="Active" value={activeUsers.length} tone="#16A34A" />
            <EmployeeStatCard label="Inactive" value={inactiveUsers.length} tone="#DC2626" />
          </Stack>
          <Tabs
            value={employeeTab}
            onChange={(_event, value) => onEmployeeTabChange(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 34,
              '& .MuiTab-root': { minHeight: 34, py: 0.25, px: 1.5, fontSize: 13, fontWeight: 850 },
            }}
          >
            <Tab value="ACTIVE" label={`Active (${activeUsers.length})`} />
            <Tab value="INACTIVE" label={`Inactive (${inactiveUsers.length})`} />
          </Tabs>
        </Stack>
      </Box>

      <Box
        sx={{
          px: { xs: 1.25, md: 2 },
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) => theme.custom.semantic.paperSoft,
          '& .MuiInputBase-root': { height: 36 },
          '& .MuiButton-root': { minHeight: 36, py: 0.5 },
        }}
      >
        <Grid container spacing={1} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, lg: 4 }}>
            <TextField
              placeholder="Search Employees"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4, lg: 2.1 }}>
            <TextField select label="Department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} fullWidth>
              <MenuItem value="">All Departments</MenuItem>
              {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, lg: 1.8 }}>
            <TextField select label="Role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} fullWidth>
              <MenuItem value="">All Roles</MenuItem>
              {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, lg: 1.5 }}>
            <TextField select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} fullWidth>
              <MenuItem value="ALL">Current Tab</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, lg: 1.6 }}>
            <Button variant="contained" fullWidth onClick={() => onError('New employees should use the registration flow and be approved from Pending Registrations.')}>
              + Add Employee
            </Button>
          </Grid>
          <Grid size={{ xs: 12, lg: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
              {filteredUsers.length} shown
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {isMobile ? (
        <EmployeeMobileList
          loading={loading}
          rows={pagedUsers}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onMenuOpen={openMenu}
        />
      ) : (
        <EmployeeTable
          loading={loading}
          rows={pagedUsers}
          selectedIds={selectedIds}
          sortBy={sortBy}
          sortDirection={sortDirection}
          allPageSelected={allPageSelected}
          somePageSelected={somePageSelected}
          onSort={requestSort}
          onToggle={toggleRow}
          onTogglePage={togglePageRows}
          onMenuOpen={openMenu}
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
        rowsPerPageOptions={[15, 25, 50]}
        sx={{ px: 2, borderTop: '1px solid', borderColor: 'divider', '& .MuiTablePagination-toolbar': { minHeight: 44 } }}
      />

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

      {selectedIds.length > 0 && (
        <BulkEmployeeToolbar
          count={selectedIds.length}
          onChangeDepartment={() => setBulkAction('change-department')}
          onChangeRole={() => setBulkAction('change-role')}
          onDeactivate={() => setBulkAction('deactivate')}
          onExport={exportSelected}
          onClear={() => setSelectedIds([])}
        />
      )}

      <BulkActionDialog
        action={bulkAction}
        selectedUsers={selectedUsers}
        departments={departments}
        lifecycleRoles={lifecycleRoles}
        reportingAuthorities={reportingAuthorities}
        onClose={() => setBulkAction('')}
        onDone={async (notice) => {
          setBulkAction('');
          setSelectedIds([]);
          onMessage(notice);
          await onReload();
        }}
        onError={onError}
      />
    </Box>
  );
}

function EmployeeStatCard({ label, value, tone }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.8,
        minWidth: { xs: '100%', sm: 132 },
        borderRadius: 1.75,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: (theme) => theme.custom.tokens.shadows.inset,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ color: tone, lineHeight: 1 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>{label}</Typography>
      </Stack>
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
        color: tone.color,
        bgcolor: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        fontWeight: 850,
        minWidth: 'max-content',
        flexShrink: 0,
        '& .MuiChip-label': { px: 1.1, display: 'block' },
      }}
    />
  );
}

function EmployeeStatusBadge({ status }) {
  const active = status === 'ACTIVE';
  return (
    <Chip
      size="small"
      label={active ? 'Active' : 'Inactive'}
      sx={{
        color: active ? '#15803D' : '#B91C1C',
        bgcolor: active ? '#DCFCE7' : '#FEE2E2',
        border: `1px solid ${active ? '#86EFAC' : '#FCA5A5'}`,
        borderRadius: 999,
        fontWeight: 850,
        minWidth: 72,
      }}
    />
  );
}

function CompactTextCell({ value }) {
  return (
    <TableCell sx={{ py: 0.55, px: 1.25, minWidth: 0 }}>
      <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
        {value}
      </Typography>
    </TableCell>
  );
}

function EmployeeTable({
  loading,
  rows,
  selectedIds,
  sortBy,
  sortDirection,
  allPageSelected,
  somePageSelected,
  onSort,
  onToggle,
  onTogglePage,
  onMenuOpen,
}) {
  const columns = [
    { key: 'full_name', label: 'Employee Name', width: '30%' },
    { key: 'department_name', label: 'Department', width: '15%' },
    { key: 'role_name', label: 'Role', width: '14%' },
    { key: 'reporting_manager_name', label: 'Reporting Manager', width: '18%' },
    { key: 'status', label: 'Status', width: '9%' },
    { key: 'created_at', label: 'Created Date', width: '10%' },
  ];

  return (
    <TableContainer sx={{ maxHeight: 720, borderTop: '1px solid', borderColor: 'divider', overflowX: 'hidden' }}>
      <Table stickyHeader size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" sx={{ width: 44, bgcolor: (theme) => theme.custom.semantic.paper, py: 0.35 }}>
              <Checkbox size="small" checked={allPageSelected} indeterminate={somePageSelected} onChange={(event) => onTogglePage(event.target.checked)} />
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column.key} sx={{ width: column.width, bgcolor: (theme) => theme.custom.semantic.paper, py: 0.7, px: 1.25, whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortBy === column.key}
                  direction={sortBy === column.key ? sortDirection : 'asc'}
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
            <TableCell align="right" sx={{ width: 56, bgcolor: (theme) => theme.custom.semantic.paper, py: 0.7, px: 1, whiteSpace: 'nowrap' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={`employee-skeleton-${index}`} sx={{ height: 58 }}>
              <TableCell padding="checkbox"><Skeleton width={22} /></TableCell>
              {columns.map((column) => <TableCell key={column.key} sx={{ py: 0.55, px: 1.25 }}><Skeleton height={24} /></TableCell>)}
              <TableCell align="right"><Skeleton width={28} /></TableCell>
            </TableRow>
          )) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 2}>
                <Box sx={{ py: 7, textAlign: 'center' }}>
                  <Typography variant="h6">No employees found</Typography>
                  <Typography variant="body2" color="text.secondary">Adjust search or filters to find employee records.</Typography>
                </Box>
              </TableCell>
            </TableRow>
          ) : rows.map((row, index) => (
            <TableRow
              hover
              key={row.id}
              selected={selectedIds.includes(row.id)}
              sx={{
                height: 60,
                bgcolor: index % 2 === 1 ? 'rgba(248,250,252,0.52)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(219,234,254,0.38)' },
              }}
            >
              <TableCell padding="checkbox" sx={{ width: 44, py: 0.55 }}>
                <Checkbox size="small" checked={selectedIds.includes(row.id)} onChange={() => onToggle(row.id)} />
              </TableCell>
              <TableCell sx={{ py: 0.55, px: 1.25, minWidth: 0 }}>
                <EmployeeIdentityCell user={row} />
              </TableCell>
              <CompactTextCell value={row.department_name || '-'} />
              <TableCell sx={{ py: 0.55, px: 1.25, overflow: 'visible' }}><RoleBadge roleCode={row.role_code} roleName={row.role_name} /></TableCell>
              <CompactTextCell value={row.reporting_manager_name || missingReportingAuthorityText} />
              <TableCell sx={{ py: 0.55, px: 1.25 }}><EmployeeStatusBadge status={row.status} /></TableCell>
              <CompactTextCell value={formatDate(row.created_at)} />
              <TableCell align="right" sx={{ py: 0.55, px: 1 }}>
                <IconButton size="small" onClick={(event) => onMenuOpen(event, row)} aria-label="Employee actions" sx={{ width: 30, height: 30 }}>
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

function EmployeeMobileList({ loading, rows, selectedIds, onToggle, onMenuOpen }) {
  return (
    <Stack spacing={1.25} sx={{ p: 1.25 }}>
      {loading ? Array.from({ length: 5 }).map((_, index) => (
        <Box key={`employee-mobile-skeleton-${index}`} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Skeleton width="65%" height={28} />
          <Skeleton width="42%" />
          <Skeleton width="88%" />
        </Box>
      )) : rows.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="h6">No employees found</Typography>
          <Typography variant="body2" color="text.secondary">Try clearing one or more filters.</Typography>
        </Box>
      ) : rows.map((row) => (
        <Box
          key={row.id}
          sx={{
            p: 1.15,
            borderRadius: 1.75,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: (theme) => theme.custom.semantic.elevated,
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Checkbox checked={selectedIds.includes(row.id)} onChange={() => onToggle(row.id)} sx={{ p: 0.25 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <EmployeeIdentityCell user={row} />
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                <RoleBadge roleCode={row.role_code} roleName={row.role_name} />
                <EmployeeStatusBadge status={row.status} />
              </Stack>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.75 }}><strong>Department:</strong> {row.department_name || '-'}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap><strong>Reporting Manager:</strong> {row.reporting_manager_name || missingReportingAuthorityText}</Typography>
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
  const active = user?.status === 'ACTIVE';
  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <MenuItem onClick={onView}>View Profile</MenuItem>
      {active ? [
        <MenuItem key="edit" onClick={() => onAction('edit')}>Edit Employee</MenuItem>,
        <MenuItem key="role" onClick={() => onAction('change-role')}>Change Role</MenuItem>,
        <MenuItem key="department" onClick={() => onAction('change-department')}>Change Department</MenuItem>,
        <MenuItem key="manager" onClick={() => onAction('change-manager')}>Change Reporting Manager</MenuItem>,
        <MenuItem key="reassign" onClick={() => onAction('reassign')}>Reassign Responsibilities</MenuItem>,
        <MenuItem key="deactivate" onClick={() => onAction('deactivate')} sx={{ color: 'error.main' }}>Deactivate Employee</MenuItem>,
      ] : (
        <MenuItem onClick={() => onAction('reactivate')}>Reactivate Employee</MenuItem>
      )}
    </Menu>
  );
}

function EmployeeProfileDrawer({ user, responsibilities, loading, onClose }) {
  const items = responsibilities.items || [];
  const countFor = (key) => items.find((item) => item.key === key)?.count || 0;
  return (
    <Drawer anchor="right" open={Boolean(user)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, p: 0 } }}>
      {user && (
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', p: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={900}>Employee Profile</Typography>
              <Typography variant="h6">{user.full_name}</Typography>
            </Box>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
          <Stack spacing={1.5} sx={{ px: 2.25, pb: 2.25, overflowY: 'auto' }}>
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
  return (
    <Box sx={{ p: 2, borderRadius: 2.25, border: '1px solid', borderColor: 'divider', bgcolor: (theme) => theme.custom.semantic.elevated }}>
      <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1.25 }}>{title}</Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

function ProfileField({ label, value }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography component="div" variant="body2" fontWeight={800} sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</Typography>
    </Stack>
  );
}

function MiniMetric({ label, value }) {
  return (
    <Box sx={{ p: 1.2, borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
      <Typography variant="h6">{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
    </Box>
  );
}

function BulkEmployeeToolbar({ count, onChangeDepartment, onChangeRole, onDeactivate, onExport, onClear }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 16,
        zIndex: 4,
        mx: { xs: 1.25, md: 2.5 },
        mb: 2,
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: (theme) => theme.custom.semantic.paper,
        boxShadow: (theme) => theme.custom.tokens.shadows.hover,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
        <Typography variant="body2" fontWeight={900}>{count} employee{count === 1 ? '' : 's'} selected</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button size="small" variant="outlined" onClick={onChangeDepartment}>Change Department</Button>
          <Button size="small" variant="outlined" onClick={onChangeRole}>Change Role</Button>
          <Button size="small" color="error" variant="outlined" onClick={onDeactivate}>Deactivate</Button>
          <Button size="small" variant="outlined" onClick={onExport}>Export</Button>
          <Button size="small" onClick={onClear}>Clear</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function BulkActionDialog({ action, selectedUsers, departments, lifecycleRoles, reportingAuthorities, onClose, onDone, onError }) {
  const [form, setForm] = useState({ departmentId: '', roleId: '', reportingManagerUserId: '', replacementDepartmentHeadUserId: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm({ departmentId: '', roleId: '', reportingManagerUserId: '', replacementDepartmentHeadUserId: '' });
    setSubmitting(false);
  }, [action]);

  if (!action) return null;

  const title = {
    'change-department': 'Bulk Change Department',
    'change-role': 'Bulk Change Role',
    deactivate: 'Bulk Deactivate Employees',
  }[action];

  async function submit() {
    setSubmitting(true);
    try {
      if (action === 'change-department') {
        await Promise.all(selectedUsers.map((user) => api.post(`/users/${user.id}/change-department`, {
          departmentId: form.departmentId,
          reportingManagerUserId: form.reportingManagerUserId,
          replacementDepartmentHeadUserId: form.replacementDepartmentHeadUserId || null,
        })));
        await onDone('Department updated for selected employees.');
      } else if (action === 'change-role') {
        await Promise.all(selectedUsers.map((user) => api.post(`/users/${user.id}/change-role`, {
          roleId: form.roleId,
          replacementDepartmentHeadUserId: form.replacementDepartmentHeadUserId || null,
        })));
        await onDone('Role updated for selected employees.');
      } else if (action === 'deactivate') {
        await Promise.all(selectedUsers.map((user) => api.post(`/users/${user.id}/deactivate`)));
        await onDone('Selected employees deactivated.');
      }
    } catch (err) {
      onError(err.message);
      setSubmitting(false);
    }
  }

  const disabled = submitting
    || (action === 'change-department' && (!form.departmentId || !form.reportingManagerUserId))
    || (action === 'change-role' && !form.roleId);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity={action === 'deactivate' ? 'warning' : 'info'}>
            {action === 'deactivate'
              ? `This will deactivate ${selectedUsers.length} selected employee${selectedUsers.length === 1 ? '' : 's'}. Employees with active responsibilities must be reassigned first.`
              : `This action applies to ${selectedUsers.length} selected employee${selectedUsers.length === 1 ? '' : 's'}.`}
          </Alert>
          {action === 'change-department' && (
            <>
              <SelectField label="New Department" value={form.departmentId} options={departments.filter((item) => item.status === 'ACTIVE')} getLabel={(item) => item.name} onChange={(value) => setForm((current) => ({ ...current, departmentId: value }))} />
              <SelectField label="New Reporting Manager" value={form.reportingManagerUserId} options={reportingAuthorities} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => setForm((current) => ({ ...current, reportingManagerUserId: value }))} />
              <SelectField label="Replacement Department Head If Needed" value={form.replacementDepartmentHeadUserId} options={reportingAuthorities} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => setForm((current) => ({ ...current, replacementDepartmentHeadUserId: value }))} />
            </>
          )}
          {action === 'change-role' && (
            <>
              <SelectField label="New Role" value={form.roleId} options={lifecycleRoles} getLabel={(role) => role.name} onChange={(value) => setForm((current) => ({ ...current, roleId: value }))} />
              <SelectField label="Replacement Department Head If Needed" value={form.replacementDepartmentHeadUserId} options={reportingAuthorities} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => setForm((current) => ({ ...current, replacementDepartmentHeadUserId: value }))} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={action === 'deactivate' ? 'error' : 'primary'} onClick={submit} disabled={disabled}>
          {submitting ? 'Working...' : action === 'deactivate' ? 'Confirm Deactivation' : 'Apply Changes'}
        </Button>
      </DialogActions>
    </Dialog>
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
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
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
                <SelectField label="New Reported To" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('reportingManagerUserId', value)} />
              </Grid>
              {activeResponsibilities.some((item) => item.key === 'departmentHead') && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <SelectField label="Replacement Department Head" value={form.replacementDepartmentHeadUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => item.full_name} onChange={(value) => onChange('replacementDepartmentHeadUserId', value)} />
                </Grid>
              )}
            </Grid>
          )}

          {action === 'change-manager' && (
            <SelectField label="New Reported To" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('reportingManagerUserId', value)} />
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
                <SelectField label="Reported To" value={form.reportingManagerUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('reportingManagerUserId', value)} />
              </Grid>
            </Grid>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' } }}>
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
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
        <Avatar sx={{ width: 44, height: 44, bgcolor: '#DBEAFE', color: 'primary.main', fontWeight: 900 }}>{user.full_name?.[0]}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={900}>{user.full_name}</Typography>
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
  const activeItems = responsibilities.items?.filter((item) => item.count > 0) || [];
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
      <Typography fontWeight={900}>Active Responsibility Check</Typography>
      <Typography variant="body2" color="text.secondary">
        {loading ? 'Checking active work...' : activeItems.length ? `${responsibilities.total} active responsibility record(s) must be transferred.` : 'No active responsibilities found.'}
      </Typography>
      {activeItems.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {activeItems.map((item) => (
            <Box key={item.key}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" fontWeight={850}>{item.label}</Typography>
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
          <SelectField label="New Department Head / Reported To" value={form.departmentHeadUserId || ''} options={reportingAuthorities.filter((item) => item.id !== user.id)} getLabel={(item) => `${item.full_name} · ${item.role_name}`} onChange={(value) => onChange('departmentHeadUserId', value)} />
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
