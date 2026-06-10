import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Drawer,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import api from '../api/client';
import { Page } from '../components/LayoutPrimitives';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { formatEnum } from '../utils/constants';

const workloadStatusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'OVERLOADED', label: 'Overloaded' },
];

function formatDate(value) {
  if (!value) return 'Not planned';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function statusLabel(value) {
  return {
    AVAILABLE: 'Available',
    MODERATE: 'Moderate',
    OVERLOADED: 'Overloaded',
  }[value] || 'Available';
}

function statusTone(value, theme) {
  const dark = theme.palette.mode === 'dark';
  return {
    AVAILABLE: { color: '#16A34A', bg: dark ? 'rgba(22,163,74,0.14)' : '#F0FDF4', border: dark ? 'rgba(74,222,128,0.24)' : '#BBF7D0' },
    MODERATE: { color: '#D97706', bg: dark ? 'rgba(245,158,11,0.14)' : '#FFFBEB', border: dark ? 'rgba(251,191,36,0.26)' : '#FDE68A' },
    OVERLOADED: { color: '#DC2626', bg: dark ? 'rgba(220,38,38,0.14)' : '#FEF2F2', border: dark ? 'rgba(248,113,113,0.28)' : '#FECACA' },
  }[value] || { color: theme.palette.text.secondary, bg: theme.custom.semantic.paperSoft, border: theme.custom.semantic.borderSoft };
}

export default function DeveloperWorkloadPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const semantic = theme.custom.semantic;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rangeFilter, setRangeFilter] = useState('');
  const [selectedDeveloper, setSelectedDeveloper] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api.get('/developer-workload'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const developers = data?.developers || [];
  const departments = useMemo(() => [...new Map(developers
    .filter((developer) => developer.department_id)
    .map((developer) => [developer.department_id, developer.department_name || 'Unassigned'])).entries()]
    .map(([id, name]) => ({ id, name })), [developers]);

  const filteredDevelopers = useMemo(() => {
    const queryTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return developers.filter((developer) => {
      const searchable = [developer.full_name, developer.employee_id, developer.email].filter(Boolean).join(' ').toLowerCase();
      const count = Number(developer.active_request_count || 0);
      const matchesRange = !rangeFilter
        || (rangeFilter === '0-3' && count <= 3)
        || (rangeFilter === '4-6' && count >= 4 && count <= 6)
        || (rangeFilter === '7+' && count >= 7);
      return (!queryTokens.length || queryTokens.every((token) => searchable.includes(token)))
        && (!departmentFilter || String(developer.department_id) === String(departmentFilter))
        && (!statusFilter || developer.workload_status === statusFilter)
        && matchesRange;
    });
  }, [departmentFilter, developers, rangeFilter, search, statusFilter]);

  const summary = data?.summary || {
    totalDevelopers: 0,
    available: 0,
    moderate: 0,
    overloaded: 0,
    activeAssignedRequests: 0,
  };

  function exportWorkload() {
    const headers = ['Developer', 'Employee ID', 'Department', 'Active Requests', 'In Development', 'In Testing', 'QA Pending', 'Status'];
    const csvRows = filteredDevelopers.map((developer) => [
      developer.full_name,
      developer.employee_id,
      developer.department_name || 'Unassigned',
      developer.active_request_count,
      developer.in_development_count,
      developer.in_testing_count,
      developer.qa_pending_count,
      statusLabel(developer.workload_status),
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'developer-workload.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Page maxWidth={1480}>
      <PageHeader
        eyebrow="RESOURCE MANAGEMENT"
        title="Developer Workload"
        description="Monitor team capacity, assignments, and workload distribution."
        actions={(
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportWorkload} disabled={loading || filteredDevelopers.length === 0}>Export</Button>
            <Button variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
          </Stack>
        )}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={1.5}>
        <SummaryCard label="Total Developers" value={summary.totalDevelopers} icon={<GroupsOutlinedIcon />} />
        <SummaryCard label="Available" value={summary.available} icon={<CheckCircleIcon />} status="AVAILABLE" />
        <SummaryCard label="Moderately Loaded" value={summary.moderate} icon={<SpeedOutlinedIcon />} status="MODERATE" />
        <SummaryCard label="Overloaded" value={summary.overloaded} icon={<WarningAmberOutlinedIcon />} status="OVERLOADED" />
        <SummaryCard label="Active Assigned Requests" value={summary.activeAssignedRequests} icon={<AssignmentOutlinedIcon />} />
      </Grid>

      <Box sx={{ borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <Stack spacing={1.5} sx={{ p: { xs: 1.5, md: 2 }, borderBottom: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper }}>
          <Grid container spacing={1.25} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search developer name or employee ID"
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
            <Grid size={{ xs: 12, sm: 4, lg: 2.5 }}>
              <TextField select label="Department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} fullWidth>
                <MenuItem value="">All Departments</MenuItem>
                {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, lg: 2.5 }}>
              <TextField select label="Workload Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} fullWidth>
                {workloadStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, lg: 2 }}>
              <TextField select label="Active Requests" value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)} fullWidth>
                <MenuItem value="">All Ranges</MenuItem>
                <MenuItem value="0-3">0-3</MenuItem>
                <MenuItem value="4-6">4-6</MenuItem>
                <MenuItem value="7+">7+</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, lg: 1 }}>
              <Button fullWidth color="inherit" onClick={() => { setSearch(''); setDepartmentFilter(''); setStatusFilter(''); setRangeFilter(''); }}>
                Reset
              </Button>
            </Grid>
          </Grid>
        </Stack>

        {loading ? (
          <Box sx={{ p: 3 }}>
            <LinearProgress />
          </Box>
        ) : isMobile ? (
          <Stack spacing={1.25} sx={{ p: 1.5, bgcolor: semantic.paperSoft }}>
            {filteredDevelopers.length === 0 ? <EmptyWorkload /> : filteredDevelopers.map((developer) => (
              <DeveloperCard key={developer.id} developer={developer} onClick={() => setSelectedDeveloper(developer)} />
            ))}
          </Stack>
        ) : (
          <DeveloperWorkloadTable rows={filteredDevelopers} onSelect={setSelectedDeveloper} />
        )}
      </Box>

      <DeveloperDetailsDrawer developer={selectedDeveloper} onClose={() => setSelectedDeveloper(null)} />
    </Page>
  );
}

function SummaryCard({ label, value, icon, status }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  const tone = status ? statusTone(status, theme) : { color: theme.palette.primary.main, bg: theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF', border: semantic.borderSoft };
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
      <Box sx={{ p: 1.75, borderRadius: 1.5, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 1.25, display: 'grid', placeItems: 'center', color: tone.color, bgcolor: tone.bg, border: `1px solid ${tone.border}` }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>{value}</Typography>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
          </Box>
        </Stack>
      </Box>
    </Grid>
  );
}

function WorkloadStatusChip({ value }) {
  const theme = useTheme();
  const tone = statusTone(value, theme);
  return (
    <Chip
      size="small"
      label={statusLabel(value)}
      sx={{
        borderRadius: 1,
        color: tone.color,
        bgcolor: tone.bg,
        border: `1px solid ${tone.border}`,
        fontWeight: 700,
      }}
    />
  );
}

function DeveloperWorkloadTable({ rows, onSelect }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table stickyHeader sx={{ minWidth: 980 }}>
        <TableHead>
          <TableRow>
            {['Developer', 'Department', 'Active Requests', 'In Development', 'In Testing', 'QA Pending', 'Status'].map((header) => (
              <TableCell key={header}>{header}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} sx={{ border: 0 }}>
                <EmptyWorkload />
              </TableCell>
            </TableRow>
          ) : rows.map((developer) => (
            <TableRow
              key={developer.id}
              hover
              onClick={() => onSelect(developer)}
              sx={{ height: 72, cursor: 'pointer', '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.08)' : semantic.paperSoft } }}
            >
              <TableCell><DeveloperIdentity developer={developer} /></TableCell>
              <TableCell>{developer.department_name || 'Unassigned'}</TableCell>
              <TableCell>{developer.active_request_count}</TableCell>
              <TableCell>{developer.in_development_count}</TableCell>
              <TableCell>{developer.in_testing_count}</TableCell>
              <TableCell>{developer.qa_pending_count}</TableCell>
              <TableCell><WorkloadStatusChip value={developer.workload_status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DeveloperCard({ developer, onClick }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Box onClick={onClick} sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper, cursor: 'pointer' }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <DeveloperIdentity developer={developer} />
          <WorkloadStatusChip value={developer.workload_status} />
        </Stack>
        <Grid container spacing={1}>
          <MiniStat label="Active" value={developer.active_request_count} />
          <MiniStat label="Development" value={developer.in_development_count} />
          <MiniStat label="Testing" value={developer.in_testing_count} />
          <MiniStat label="QA Pending" value={developer.qa_pending_count} />
        </Grid>
      </Stack>
    </Box>
  );
}

function DeveloperIdentity({ developer }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar sx={{ width: 38, height: 38, bgcolor: theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', color: 'primary.main', fontWeight: 750 }}>
        {developer.full_name?.[0]}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} noWrap>{developer.full_name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{developer.employee_id}</Typography>
      </Box>
    </Stack>
  );
}

function MiniStat({ label, value }) {
  const semantic = useTheme().custom.semantic;
  return (
    <Grid size={{ xs: 6 }}>
      <Box sx={{ p: 1, borderRadius: 1, bgcolor: semantic.paperSoft, border: `1px solid ${semantic.borderSoft}` }}>
        <Typography variant="body2" fontWeight={700}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Box>
    </Grid>
  );
}

function DeveloperDetailsDrawer({ developer, onClose }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Drawer
      anchor="right"
      open={Boolean(developer)}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        zIndex: (currentTheme) => currentTheme.zIndex.modal + 20,
        '& .MuiDrawer-paper': {
          zIndex: (currentTheme) => currentTheme.zIndex.modal + 20,
        },
      }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 560 },
          height: '100dvh',
          maxHeight: '100dvh',
          bgcolor: semantic.paperSoft,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {developer && (
        <Stack sx={{ height: '100%', minHeight: 0 }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              p: 2.25,
              justifyContent: 'space-between',
              alignItems: 'center',
              bgcolor: semantic.paper,
              borderBottom: `1px solid ${semantic.borderSoft}`,
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            <Box>
              <Typography variant="caption" color="primary.main" fontWeight={750} sx={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Developer Workload</Typography>
              <Typography variant="h5" fontWeight={750}>{developer.full_name}</Typography>
              <Typography variant="body2" color="text.secondary">{developer.department_name || 'Unassigned'} · {developer.employee_id}</Typography>
            </Box>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Stack>

          <Stack spacing={1.5} sx={{ p: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: semantic.paper, border: `1px solid ${semantic.borderSoft}` }}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">Developer Information</Typography>
                <WorkloadStatusChip value={developer.workload_status} />
              </Stack>
              <Grid container spacing={1} sx={{ mt: 1 }}>
                <MiniStat label="Active Requests" value={developer.active_request_count} />
                <MiniStat label="In Development" value={developer.in_development_count} />
                <MiniStat label="In Testing" value={developer.in_testing_count} />
                <MiniStat label="QA Pending" value={developer.qa_pending_count} />
              </Grid>
            </Box>

            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: semantic.paper, border: `1px solid ${semantic.borderSoft}` }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Current Assignments</Typography>
              <Stack spacing={1}>
                {developer.assignments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No active assignments.</Typography>
                ) : developer.assignments.map((assignment) => (
                  <AssignmentItem key={assignment.request_id} assignment={assignment} />
                ))}
              </Stack>
            </Box>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}

function AssignmentItem({ assignment }) {
  const semantic = useTheme().custom.semantic;
  return (
    <Box sx={{ p: 1.25, borderRadius: 1.25, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paperSoft }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="primary.main" fontWeight={750}>{assignment.request_number}</Typography>
          <Typography variant="body2" fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{assignment.title}</Typography>
        </Box>
        <StatusBadge value={assignment.priority} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
        <Chip size="small" label={formatEnum(assignment.status)} sx={{ borderRadius: 1 }} />
        <Typography variant="caption" color="text.secondary">Assigned {formatDate(assignment.assigned_at)}</Typography>
        <Typography variant="caption" color="text.secondary">Target {formatDate(assignment.target_completion_date)}</Typography>
      </Stack>
    </Box>
  );
}

function EmptyWorkload() {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', py: 5 }}>
      <AssignmentOutlinedIcon color="disabled" />
      <Typography variant="subtitle1" fontWeight={700}>No developers found</Typography>
      <Typography variant="body2" color="text.secondary">Try adjusting search or filters.</Typography>
    </Stack>
  );
}
