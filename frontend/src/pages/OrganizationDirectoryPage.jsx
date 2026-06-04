import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Grid,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import TableRowsIcon from '@mui/icons-material/TableRows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import api from '../api/client';
import { Page } from '../components/LayoutPrimitives';
import { formatEnum, missingReportingAuthorityText } from '../utils/constants';

const viewModes = [
  { id: 'hierarchy', label: 'Organization Hierarchy', icon: AccountTreeIcon },
  { id: 'departments', label: 'Department Directory', icon: BusinessIcon },
  { id: 'table', label: 'Directory Table', icon: TableRowsIcon },
];

export default function OrganizationDirectoryPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('hierarchy');
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    departmentId: '',
    role: '',
    status: '',
    manager: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [directoryUsers, directoryDepartments] = await Promise.all([
        api.get('/users/directory'),
        api.get('/departments/directory'),
      ]);
      setUsers(directoryUsers);
      setDepartments(directoryDepartments);
      setExpandedDepartments(new Set(directoryDepartments.map((department) => department.id)));
    } catch (err) {
      setError(err.message || 'Unable to load organization directory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const roles = useMemo(() => [...new Set(users.map((user) => user.role_code).filter(Boolean))], [users]);
  const managers = useMemo(() => [...new Map(users
    .filter((user) => user.manager_id)
    .map((user) => [user.manager_id, { id: user.manager_id, name: user.manager_name }])).values()], [users]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [
      user.full_name,
      user.email,
      user.department_name,
      formatEnum(user.role_code),
      user.employee_id,
      user.designation,
    ].some((value) => String(value || '').toLowerCase().includes(search));
    return matchesSearch
      && (!filters.departmentId || String(user.department_id) === String(filters.departmentId))
      && (!filters.role || user.role_code === filters.role)
      && (!filters.status || user.status === filters.status)
      && (!filters.manager || String(user.manager_id) === String(filters.manager));
  }), [users, filters]);

  const usersByDepartment = useMemo(() => departments.map((department) => ({
    ...department,
    members: filteredUsers.filter((user) => user.department_id === department.id),
  })).filter((department) => department.members.length || !filters.search), [departments, filteredUsers, filters.search]);

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setFilters({ search: '', departmentId: '', role: '', status: '', manager: '' });
  }

  async function copyEmail(email) {
    await navigator.clipboard?.writeText(email);
    setCopied(true);
  }

  function toggleDepartment(departmentId) {
    setExpandedDepartments((current) => {
      const next = new Set(current);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function exportDirectory() {
    const columns = ['Employee', 'Email', 'Department', 'Role', 'Manager', 'Status', 'Joined Date'];
    const rows = filteredUsers.map((user) => [
      user.full_name,
      user.email,
      user.department_name,
      formatEnum(user.role_code),
      user.manager_name,
      user.status,
      formatDate(user.created_at),
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'organization-directory.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Page maxWidth={1560}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', lg: 'center' } }}>
          <Box>
            <Typography variant="h4" sx={{ fontSize: { xs: 28, md: 32 } }}>Organization Directory</Typography>
            <Typography color="text.secondary" variant="body2">
              Browse employees, departments, reporting structure, and contact information.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap', width: { xs: '100%', lg: 'auto' } }}>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportDirectory}>Export Directory</Button>
            <Button variant="contained" onClick={load}>Refresh</Button>
          </Stack>
        </Stack>

        <Box
          sx={{
            borderRadius: 2.25,
            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            bgcolor: (theme) => theme.custom.semantic.elevated,
            overflow: 'hidden',
          }}
        >
          <Stack direction="row" spacing={0.5} sx={{ px: 1.5, pt: 1.25, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, overflowX: 'auto' }}>
            {viewModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <Button
                  key={mode.id}
                  startIcon={<Icon fontSize="small" />}
                  onClick={() => setViewMode(mode.id)}
                  sx={{
                    minHeight: 38,
                    px: 1.5,
                    borderRadius: 0,
                    whiteSpace: 'nowrap',
                    color: viewMode === mode.id ? 'primary.main' : 'text.secondary',
                    borderBottom: viewMode === mode.id ? '2px solid' : '2px solid transparent',
                    borderColor: viewMode === mode.id ? 'primary.main' : 'transparent',
                    '&:hover': { boxShadow: 'none', transform: 'none' },
                  }}
                >
                  {mode.label}
                </Button>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ p: 1.35, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft, flexWrap: 'wrap' }}>
            <TextField
              label="Search Users"
              value={filters.search}
              onChange={(event) => setFilter('search', event.target.value)}
              InputProps={{ startAdornment: <SearchIcon color="action" fontSize="small" sx={{ mr: 0.75 }} /> }}
              sx={{ width: { xs: '100%', md: 300 } }}
            />
            <TextField select label="Filter Department" value={filters.departmentId} onChange={(event) => setFilter('departmentId', event.target.value)} sx={{ width: { xs: '100%', sm: 190 } }}>
              <MenuItem value="">All departments</MenuItem>
              {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField select label="Filter Role" value={filters.role} onChange={(event) => setFilter('role', event.target.value)} sx={{ width: { xs: '100%', sm: 170 } }}>
              <MenuItem value="">All roles</MenuItem>
              {roles.map((role) => <MenuItem key={role} value={role}>{formatEnum(role)}</MenuItem>)}
            </TextField>
            <TextField select label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)} sx={{ width: { xs: '100%', sm: 145 } }}>
              <MenuItem value="">All statuses</MenuItem>
              {['ACTIVE', 'PENDING_APPROVAL'].map((status) => <MenuItem key={status} value={status}>{formatEnum(status)}</MenuItem>)}
            </TextField>
            <TextField select label="Manager" value={filters.manager} onChange={(event) => setFilter('manager', event.target.value)} sx={{ width: { xs: '100%', sm: 190 } }}>
              <MenuItem value="">All managers</MenuItem>
              {managers.map((manager) => <MenuItem key={manager.id} value={manager.id}>{manager.name}</MenuItem>)}
            </TextField>
            <Button variant="outlined" onClick={clearFilters} sx={{ ml: { md: 'auto' }, width: { xs: '100%', sm: 'auto' } }}>Clear</Button>
          </Stack>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <DirectoryShell>Loading organization directory...</DirectoryShell>
        ) : viewMode === 'hierarchy' ? (
          <OrganizationHierarchy departments={usersByDepartment} onCopyEmail={copyEmail} />
        ) : viewMode === 'departments' ? (
          <DepartmentDirectory departments={usersByDepartment} expanded={expandedDepartments} onToggle={toggleDepartment} onCopyEmail={copyEmail} />
        ) : (
          <DirectoryTable users={filteredUsers} onCopyEmail={copyEmail} />
        )}
      </Stack>

      <Snackbar
        open={copied}
        autoHideDuration={2200}
        onClose={() => setCopied(false)}
        message="Email copied successfully."
      />
    </Page>
  );
}

function DirectoryShell({ children }) {
  return (
    <Box sx={{ p: 3, borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated }}>
      <Typography color="text.secondary">{children}</Typography>
    </Box>
  );
}

function OrganizationHierarchy({ departments, onCopyEmail }) {
  if (!departments.length) return <DirectoryShell>No employees match the current filters.</DirectoryShell>;

  return (
    <Grid container spacing={2}>
      {departments.map((department) => {
        const head = department.members.find((user) => user.is_department_head);
        const members = department.members.filter((user) => !user.is_department_head);
        return (
          <Grid key={department.id} size={{ xs: 12, lg: 6 }}>
            <DepartmentHierarchyCard department={department} head={head} members={members} onCopyEmail={onCopyEmail} />
          </Grid>
        );
      })}
    </Grid>
  );
}

function DepartmentHierarchyCard({ department, head, members, onCopyEmail }) {
  return (
    <Box
      sx={{
        height: '100%',
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        overflow: 'hidden',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{department.name} Department</Typography>
          <Typography variant="caption" color="text.secondary">{department.employee_count || department.members.length} employees</Typography>
        </Box>
        <Chip size="small" label={department.code} sx={{ borderRadius: 1, fontWeight: 850 }} />
      </Stack>
      <Stack spacing={1.15} sx={{ p: 2 }}>
        {head ? (
          <EmployeeCard user={head} isHead onCopyEmail={onCopyEmail} />
        ) : (
          <EmptyHead />
        )}
        <Box sx={{ pl: { xs: 0, sm: 2.1 }, borderLeft: { xs: 0, sm: '2px solid' }, borderColor: (theme) => theme.custom.semantic.borderSoft }}>
          <Stack spacing={1}>
            {members.map((member) => (
              <EmployeeCard key={member.id} user={member} onCopyEmail={onCopyEmail} />
            ))}
            {!members.length && <Typography variant="caption" color="text.secondary">No additional employees in this department.</Typography>}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function DepartmentDirectory({ departments, expanded, onToggle, onCopyEmail }) {
  if (!departments.length) return <DirectoryShell>No departments match the current filters.</DirectoryShell>;

  return (
    <Stack spacing={1.5}>
      {departments.map((department) => (
        <Box key={department.id} sx={{ borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated, overflow: 'hidden' }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            onClick={() => onToggle(department.id)}
            sx={{
              p: 2,
              cursor: 'pointer',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              bgcolor: (theme) => theme.custom.semantic.paperSoft,
            }}
          >
            <Box>
              <Typography variant="h6">{department.name}</Typography>
              <Typography variant="body2" color="text.secondary">Head: {department.department_head_name || missingReportingAuthorityText}</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <MetricChip label="Employees" value={department.employee_count || department.members.length} />
              <MetricChip label="Pending Requests" value={department.pending_request_count || 0} />
              <Chip size="small" label={expanded.has(department.id) ? 'Collapse' : 'Expand'} sx={{ borderRadius: 1 }} />
            </Stack>
          </Stack>
          <Collapse in={expanded.has(department.id)}>
            <Grid container spacing={1.25} sx={{ p: 2 }}>
              {department.members.map((member) => (
                <Grid key={member.id} size={{ xs: 12, md: 6, lg: 4 }}>
                  <EmployeeCard user={member} isHead={Boolean(member.is_department_head)} onCopyEmail={onCopyEmail} />
                </Grid>
              ))}
            </Grid>
          </Collapse>
        </Box>
      ))}
    </Stack>
  );
}

function DirectoryTable({ users, onCopyEmail }) {
  return (
    <Box sx={{ borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated, overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: { xs: 'none', md: 'calc(100vh - 280px)' }, minHeight: { md: 420 }, overflowX: 'auto' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              {['Employee', 'Email', 'Department', 'Role', 'Manager', 'Status', 'Joined Date', 'Actions'].map((column) => (
                <TableCell key={column}>{column}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableRow><TableCell colSpan={8}>No employees match the current filters.</TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell><UserIdentity user={user} /></TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere' }}>{user.email}</TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere' }}>{user.department_name || '-'}</TableCell>
                <TableCell>{formatEnum(user.role_code)}</TableCell>
                <TableCell>{user.manager_name || '-'}</TableCell>
                <TableCell><Chip size="small" label={formatEnum(user.status)} sx={{ borderRadius: 1, fontWeight: 750 }} /></TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell><Button size="small" startIcon={<ContentCopyIcon />} onClick={() => onCopyEmail(user.email)}>Copy Email</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function EmployeeCard({ user, isHead = false, onCopyEmail }) {
  return (
    <Tooltip
      arrow
      placement="top"
      title={(
        <Box sx={{ p: 0.75 }}>
          <Typography variant="body2" fontWeight={800}>{user.full_name}</Typography>
          <Typography variant="caption" display="block">Email: {user.email}</Typography>
          <Typography variant="caption" display="block">Phone: {user.mobile_number || 'Not provided'}</Typography>
          <Typography variant="caption" display="block">Employee ID: {user.employee_id}</Typography>
          <Typography variant="caption" display="block">Joined: {formatDate(user.created_at)}</Typography>
          <Typography variant="caption" display="block">Role: {formatEnum(user.role_code)}</Typography>
          <Typography variant="caption" display="block">Department: {user.department_name}</Typography>
        </Box>
      )}
    >
      <Box
        sx={{
          p: 1.25,
          borderRadius: 1.75,
          border: (theme) => `1px solid ${isHead ? theme.palette.primary.main : theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => isHead ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF') : theme.custom.semantic.paper,
          transition: 'border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 12px 28px rgba(15,23,42,0.10)',
          },
        }}
      >
        <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Avatar sx={{ width: 38, height: 38, bgcolor: isHead ? 'primary.main' : '#DBEAFE', color: isHead ? '#FFFFFF' : 'primary.main', fontWeight: 900 }}>
            {user.full_name?.[0] || '?'}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{user.full_name}</Typography>
              {isHead && <Chip size="small" label="Department Head" sx={{ height: 20, borderRadius: 1, fontSize: 11, fontWeight: 850 }} />}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap display="block">{user.designation || 'Employee'}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">{formatEnum(user.role_code)} · {user.department_name}</Typography>
          </Box>
          <Button size="small" onClick={() => onCopyEmail(user.email)} sx={{ minWidth: 0, px: 0.75 }}>
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </Button>
        </Stack>
      </Box>
    </Tooltip>
  );
}

function UserIdentity({ user }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Avatar sx={{ width: 30, height: 30, bgcolor: user.is_department_head ? 'primary.main' : '#DBEAFE', color: user.is_department_head ? '#FFFFFF' : 'primary.main', fontSize: 13, fontWeight: 850 }}>
        {user.full_name?.[0] || '?'}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{user.full_name}</Typography>
        <Typography variant="caption" color="text.secondary">{user.designation || user.employee_id}</Typography>
      </Box>
    </Stack>
  );
}

function MetricChip({ label, value }) {
  return <Chip size="small" label={`${label}: ${value}`} sx={{ borderRadius: 1, fontWeight: 780 }} />;
}

function EmptyHead() {
  return (
    <Box sx={{ p: 1.25, borderRadius: 1.75, border: (theme) => `1px dashed ${theme.custom.semantic.border}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
      <Typography variant="body2" color="text.secondary">{missingReportingAuthorityText}</Typography>
    </Box>
  );
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
