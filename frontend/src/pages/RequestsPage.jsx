import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Pagination,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { canCreateRequest, canUseRequestScopeTabs, getDefaultRequestScope } from '../auth/permissions';
import StatusBadge from '../components/StatusBadge';
import { priorities, requestTypes, formatEnum } from '../utils/constants';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';

const pageSize = 10;

const savedViews = [
  { label: 'All', status: '' },
  { label: 'More Info Needed', status: 'CLARIFICATION_REQUESTED' },
  { label: 'Approvals', status: 'DEPARTMENT_APPROVAL_PENDING' },
  { label: 'Internal Review', status: 'IT_REVIEW_PENDING' },
  { label: 'Waiting For Assignment', status: 'ASSIGNMENT_PENDING' },
  { label: 'Team Assigned', status: 'ASSIGNED' },
  { label: 'Work In Progress', status: 'IN_DEVELOPMENT' },
  { label: 'Review & Validation', status: 'IN_TESTING' },
  { label: 'Final Approval', status: 'UAT_PENDING' },
  { label: 'Completed', status: 'CLOSED' },
];

const requestScopes = [
  { label: 'All Requests', value: 'department' },
  { label: 'My Requests', value: 'mine' },
];

const pageMetaByPreset = {
  IN_DEVELOPMENT: {
    eyebrow: 'WORK EXECUTION',
    title: 'Work In Progress',
    description: 'Track active delivery work, implementation progress, and assigned request execution.',
  },
  IN_TESTING: {
    eyebrow: 'QUALITY REVIEW',
    title: 'Review & Validation',
    description: 'Review requests moving through testing, validation, and quality checks.',
  },
  UAT_PENDING: {
    eyebrow: 'FINAL APPROVAL',
    title: 'Final Approval Queue',
    description: 'Review requests awaiting final business approval and closure.',
  },
};

export default function RequestsPage({ presetStatus = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'updated_at', direction: 'desc' });
  const [scope, setScope] = useState(() => getDefaultRequestScope(user?.roleCode));
  const [filters, setFilters] = useState({
    status: presetStatus,
    priority: '',
    type: '',
    search: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const apiFilters = {
        status: filters.status,
        priority: filters.priority,
        type: filters.type,
        search: filters.search,
        mine: scope === 'mine' ? 'true' : '',
      };
      const query = new URLSearchParams(Object.entries(apiFilters).filter(([, value]) => value)).toString();
      const result = await api.get(`/requests?${query}`);
      setRows(Array.isArray(result) ? result : []);
    } catch (err) {
      setRows([]);
      setError(err.message || 'Unable to load requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [scope, filters.status, filters.priority, filters.type]);

  useEffect(() => {
    setScope(getDefaultRequestScope(user?.roleCode));
  }, [user?.roleCode]);

  const stats = {
    total: rows.length,
    pending: rows.filter((row) => ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', 'CLARIFICATION_REQUESTED'].includes(row.status)).length,
    development: rows.filter((row) => ['ASSIGNED', 'IN_DEVELOPMENT'].includes(row.status)).length,
    closed: rows.filter((row) => row.status === 'CLOSED').length,
  };

  const filteredRows = useMemo(() => [...rows]
    .sort((a, b) => {
      const aValue = a[sort.key] || '';
      const bValue = b[sort.key] || '';
      const result = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
      return sort.direction === 'asc' ? result : -result;
    }), [rows, sort]);

  const pageCount = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  function setFilter(field, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setPage(1);
    setFilters({ status: '', priority: '', type: '', search: '' });
  }

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const pageMeta = pageMetaByPreset[presetStatus] || {
    eyebrow: 'REQUEST MANAGEMENT',
    title: 'Requests',
    description: 'Track, review, assign, and manage software requirement requests throughout their lifecycle.',
  };

  return (
    <Page maxWidth={1580}>
      <Stack spacing={2}>
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          actions={(
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
            {canCreateRequest(user?.roleCode) && (
              <Button variant="contained" startIcon={<AddIcon />} component={Link} to="/requests/new">New Request</Button>
            )}
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
          </Stack>
          )}
        />

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <CompactKpi label="Total Requests" value={stats.total} />
          <CompactKpi label="Pending Action" value={stats.pending} />
          <CompactKpi label="Work In Progress" value={stats.development} />
          <CompactKpi label="Completed" value={stats.closed} />
        </Stack>

        {error && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            bgcolor: (theme) => theme.custom.semantic.elevated,
            overflow: 'hidden',
          }}
        >
          {canUseRequestScopeTabs(user?.roleCode) && (
            <Box sx={{ px: 1.5, pt: 1.25, pb: 1, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
              <Tabs
                value={scope}
                onChange={(_, value) => {
                  setPage(1);
                  setScope(value);
                }}
                variant="fullWidth"
                sx={{
                  width: { xs: '100%', sm: 360 },
                  minHeight: 42,
                  p: 0.4,
                  borderRadius: 1.75,
                  border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                  bgcolor: (theme) => theme.custom.semantic.paperSoft,
                  '& .MuiTabs-indicator': { display: 'none' },
                  '& .MuiTab-root': {
                    minHeight: 34,
                    borderRadius: 1.25,
                    textTransform: 'none',
                    fontWeight: 800,
                    color: 'text.secondary',
                  },
                  '& .Mui-selected': {
                    color: 'primary.main',
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#FFFFFF',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
                  },
                }}
              >
                {requestScopes.map((item) => (
                  <Tab key={item.value} value={item.value} label={item.label} />
                ))}
              </Tabs>
            </Box>
          )}

          <Stack direction="row" spacing={1} sx={{ p: 1.25, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft, flexWrap: 'wrap' }}>
            <TextField label="Search" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} sx={{ width: { xs: '100%', md: 280 } }} />
            <TextField select label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} sx={{ width: { xs: '100%', sm: 220 } }}>
              <MenuItem value="">All statuses</MenuItem>
              {savedViews.filter((view) => view.status).map((view) => <MenuItem key={view.status} value={view.status}>{view.label}</MenuItem>)}
            </TextField>
            <TextField select label="Priority" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} sx={{ width: { xs: '100%', sm: 140 } }}>
              <MenuItem value="">All priorities</MenuItem>
              {priorities.map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
            </TextField>
            <TextField select label="Type" value={filters.type} onChange={(e) => setFilter('type', e.target.value)} sx={{ width: { xs: '100%', sm: 160 } }}>
              <MenuItem value="">All types</MenuItem>
              {requestTypes.map((type) => <MenuItem key={type} value={type}>{formatEnum(type)}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ ml: { md: 'auto' }, width: { xs: '100%', sm: 'auto' } }}>
              <Button variant="outlined" onClick={clearFilters}>Clear</Button>
              <Button variant="contained" onClick={load}>Apply</Button>
            </Stack>
          </Stack>

          <RequestTable
            rows={pagedRows}
            loading={loading}
            sort={sort}
            onSort={changeSort}
            onOpen={(requestId) => navigate(`/requests/${requestId}`)}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, borderTop: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
            <Typography variant="body2" color="text.secondary">
              Showing {filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
            </Typography>
            <Pagination size="small" count={pageCount} page={page} onChange={(_, value) => setPage(value)} />
          </Stack>
        </Box>
      </Stack>
    </Page>
  );
}

function CompactKpi({ label, value }) {
  return (
    <Box
      sx={{
        flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
        minWidth: { xs: 0, sm: 150 },
        px: 1.35,
        py: 1,
        borderRadius: 2,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="h5" sx={{ mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

function RequestTable({ rows, loading, sort, onSort, onOpen }) {
  const headers = [
    ['request_number', 'ID', 150],
    ['title', 'Title', 'auto'],
    ['requester_name', 'Requester', 180],
    ['priority', 'Priority', 120],
    ['status', 'Status', 170],
    ['progress_percentage', 'Progress', 140],
  ];

  return (
    <>
      <Box sx={{ display: { xs: 'block', md: 'none' }, p: 1.25 }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading requests...</Typography>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No requests match the current filters.</Typography>
        ) : (
          <Stack spacing={1.1}>
            {rows.map((row) => (
              <RequestMobileCard key={row.id || row.request_number} row={row} onOpen={onOpen} />
            ))}
          </Stack>
        )}
      </Box>
      <TableContainer sx={{ display: { xs: 'none', md: 'block' }, maxHeight: { md: 'calc(100vh - 310px)' }, minHeight: { md: 440 } }}>
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: 860 }}>
          <TableHead>
            <TableRow>
              {headers.map(([key, label, width]) => (
                <TableCell key={key} onClick={() => onSort(key)} sx={{ cursor: 'pointer', whiteSpace: 'nowrap', width }}>
                  {label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={headers.length}>Loading requests...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={headers.length}>No requests match the current filters.</TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow
                key={row.id || row.request_number}
                hover
                onClick={() => onOpen(row.id)}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: (theme) => theme.custom.semantic.paperSoft } }}
              >
                <TableCell>
                  <Button component={Link} to={`/requests/${row.id}`} title={row.request_number} sx={{ px: 0, justifyContent: 'flex-start', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {row.request_number}
                  </Button>
                </TableCell>
                <TableCell>
                  <Typography fontWeight={750} noWrap title={row.title}>{row.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatEnum(row.request_type)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap title={row.requester_name || '-'}>
                    {row.requester_name || '-'}
                  </Typography>
                </TableCell>
                <TableCell><StatusBadge value={row.priority} /></TableCell>
                <TableCell><StatusBadge value={row.status} /></TableCell>
                <TableCell><ProgressCell value={row.progress_percentage} status={row.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function RequestMobileCard({ row, onOpen }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.id)}
      onKeyDown={(event) => event.key === 'Enter' && onOpen(row.id)}
      sx={{
        p: 1.4,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.paper,
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="primary.main" fontWeight={850}>{shortRequestNumber(row.request_number)}</Typography>
            <Typography fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.requester_name || 'Requester unavailable'} · {formatEnum(row.request_type)}
            </Typography>
          </Box>
          <StatusBadge value={row.priority} />
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
          <StatusBadge value={row.status} />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>Updated {relativeTime(row.updated_at)}</Typography>
        </Stack>
        <ProgressCell value={row.progress_percentage} status={row.status} />
      </Stack>
    </Box>
  );
}

function ProgressCell({ value, status }) {
  const progress = Number(value || 0);
  const shouldShow = ['ASSIGNED', 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', 'IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE', 'QA_PENDING', 'QA_FAILED', 'QA_PASSED', 'IN_TESTING', 'UAT_PENDING', 'UAT_FAILED', 'UAT_APPROVED', 'DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION', 'CLOSED'].includes(status) || progress > 0;
  if (!shouldShow) return <Typography variant="caption" color="text.secondary">-</Typography>;

  return (
    <Box>
      <Typography variant="caption" fontWeight={850}>{progress}%</Typography>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={progress >= 100 ? 'success' : 'primary'}
        sx={{ height: 6, borderRadius: 999, mt: 0.45, bgcolor: '#E2E8F0', '& .MuiLinearProgress-bar': { borderRadius: 999 } }}
      />
    </Box>
  );
}

function shortRequestNumber(value = '') {
  const match = String(value).match(/(\d{6})$/);
  return match ? `#${match[1]}` : value;
}

function relativeTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
