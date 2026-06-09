import { useEffect, useState } from 'react';
import { Avatar, Box, Button, Chip, Divider, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  GitPullRequest,
  HeartPulse,
  Plus,
  TestTube2,
  UserPlus,
  Users,
} from 'lucide-react';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { PageSkeleton } from '../components/LoadingState';
import { formatEnum, missingReportingAuthorityText } from '../utils/constants';
import { useAuth } from '../auth/AuthProvider';
import { canCreateRequest, canUseAdminConsole } from '../auth/permissions';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';

export default function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState({ cards: [], recentActivity: [] });
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const requestEndpoint = user?.roleCode === 'EMPLOYEE' ? '/requests?mine=true' : '/requests';
      const [dashboardData, requestRows, departmentRows, notificationRows] = await Promise.all([
        api.get('/dashboard/me'),
        api.get(requestEndpoint),
        api.get('/departments'),
        api.get('/notifications?isRead=0'),
      ]);
      const [userRows, registrationRows] = user?.roleCode === 'SYSTEM_ADMIN'
        ? await Promise.all([
          api.get('/users').catch(() => []),
          api.get('/admin/registrations?status=PENDING_APPROVAL').catch(() => []),
        ])
        : [[], []];
      setDashboard(dashboardData);
      setRequests(requestRows);
      setDepartments(departmentRows);
      setNotifications(notificationRows);
      setUsers(userRows);
      setRegistrations(registrationRows);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [user?.roleCode]);

  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
  const firstName = user?.fullName?.split(' ')[0] || 'there';

  const counts = {
    total: requests.length,
    pending: requests.filter((item) => ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', 'CLARIFICATION_REQUESTED'].includes(item.status)).length,
    development: requests.filter((item) => ['ASSIGNED', 'SPRINT_ACTIVE', 'IN_DEVELOPMENT'].includes(item.status)).length,
    testing: requests.filter((item) => item.status === 'IN_TESTING').length,
    closed: requests.filter((item) => item.status === 'CLOSED').length,
    pendingUat: requests.filter((item) => item.status === 'UAT_PENDING').length,
    activeUsers: users.filter((item) => item.status === 'ACTIVE').length,
    users: users.length || getDashboardCardValue(dashboard.cards, 'Total Users'),
    departments: departments.length,
  };

  const byDepartment = departments.map((department) => ({
    name: department.name,
    head: department.department_head_name || missingReportingAuthorityText,
    hasHead: Boolean(department.department_head_name),
    count: requests.filter((request) => request.department_name === department.name).length,
    pending: requests.filter((request) => request.department_name === department.name && !['CLOSED', 'DEPARTMENT_REJECTED', 'IT_REJECTED'].includes(request.status)).length,
    completed: requests.filter((request) => request.department_name === department.name && request.status === 'CLOSED').length,
  })).map((department) => ({
    ...department,
    completionRate: department.count ? Math.round((department.completed / department.count) * 100) : 0,
    attentionLevel: !department.hasHead ? 'Setup Required' : department.pending > 5 ? 'High Load' : department.pending > 0 ? 'Active' : 'Stable',
  })).sort((a, b) => b.count - a.count);

  const isEmployeeDashboard = user?.roleCode === 'EMPLOYEE';
  const kpiCards = buildRoleKpiCards(dashboard.cards);
  const developmentRequests = requests
    .filter((request) => ['ASSIGNED', 'SPRINT_ACTIVE', 'IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE'].includes(request.status) || Number(request.progress_percentage || 0) > 0)
    .sort((a, b) => Number(b.progress_percentage || 0) - Number(a.progress_percentage || 0));

  const requestActivity = dashboard.recentActivity.map((activity) => ({
    id: `request-${activity.id}`,
    actor: activity.current_assignee_name || 'RequestOps',
    action: `${activity.request_number} moved to ${formatEnum(activity.status)}`,
    detail: activity.title,
    time: activity.updated_at,
    status: activity.status,
  }));
  const registrationActivity = registrations.slice(0, 4).map((registration) => ({
    id: `registration-${registration.id}`,
    actor: registration.full_name,
    action: 'Registration awaiting admin approval',
    detail: registration.email,
    time: registration.created_at,
    status: 'PENDING_APPROVAL',
  }));
  const activityItems = [...registrationActivity, ...requestActivity].slice(0, 8);

  if (loading) return <PageSkeleton />;

  return (
    <Page maxWidth={1520}>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="WORKSPACE"
          title="Dashboard"
          description={`Welcome back, ${firstName}. ${today}`}
          actions={(
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
              {canCreateRequest(user?.roleCode) && <Button component={Link} to="/requests/new" variant="contained" startIcon={<Plus size={16} />}>Create Request</Button>}
              {canUseAdminConsole(user?.roleCode) && <Button component={Link} to="/admin" variant="outlined" startIcon={<Building2 size={16} />}>Add Department</Button>}
              {canUseAdminConsole(user?.roleCode) && <Button component={Link} to="/admin" variant="outlined" startIcon={<UserPlus size={16} />}>Add User</Button>}
            </Stack>
          )}
        />

        <Grid container spacing={1.75}>
          {kpiCards.map((card) => (
            <Grid key={card.title} size={{ xs: 12, sm: 6, lg: 3, xl: kpiCards.length >= 7 ? 12 / 7 : 12 / Math.max(kpiCards.length, 1) }}>
              <KpiCard {...card} />
            </Grid>
          ))}
        </Grid>

        <Panel title="Recent Activity Feed">
          <ActivityFeed rows={activityItems} />
        </Panel>

        {isEmployeeDashboard || ['DEVELOPER', 'QA', 'UAT_APPROVER'].includes(user?.roleCode) ? (
          <EmployeeRequestOverview requests={requests} />
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, xl: 8 }}>
              <Panel title="Department Overview" subtitle="Department request load, ownership, and completion health">
                <DepartmentOverview rows={byDepartment} />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, xl: 4 }}>
              <Panel title="Work Progress">
                <DevelopmentProgressOverview requests={developmentRequests.slice(0, 6)} />
              </Panel>
            </Grid>
            {canUseAdminConsole(user?.roleCode) && (
            <Grid size={{ xs: 12, xl: 4 }}>
              <Panel title="System Overview" subtitle="Administrative health and operating footprint">
                <SystemOverview
                  rows={[
                    ['Total users', counts.users, <Users size={16} />],
                    ['Active users', counts.activeUsers || counts.users, <Users size={16} />],
                    ['Departments', counts.departments, <Building2 size={16} />],
                    ['Open requests', counts.total - counts.closed, <GitPullRequest size={16} />],
                    ['Completed requests', counts.closed, <CheckCircle2 size={16} />],
                    ['System health', 'Healthy', <HeartPulse size={16} />],
                  ]}
                />
              </Panel>
            </Grid>
            )}
          </Grid>
        )}
      </Stack>
    </Page>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        overflow: 'hidden',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' }, px: { xs: 1.75, md: 2.5 }, py: 2, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontSize: 16 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>{subtitle}</Typography>}
        </Box>
      </Stack>
      <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>{children}</Box>
    </Box>
  );
}

function KpiCard({ title, value, change, tone, icon }) {
  const color = toneColor(tone);
  return (
    <Box
      sx={{
        minHeight: 132,
        p: 2,
        borderRadius: 3,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ color }}>{icon}</Box>
        <Chip label={change} size="small" sx={{ height: 22, color, bgcolor: `${color}14`, fontSize: 11 }} />
      </Stack>
      <Typography variant="h4" sx={{ mt: 2, fontSize: 30 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>
      <MiniTrend color={color} />
    </Box>
  );
}

function ActivityFeed({ rows }) {
  return (
    <Stack spacing={0.25}>
      {rows.length === 0 ? <Typography variant="body2" color="text.secondary">No recent activity.</Typography> : rows.map((row) => (
        <Stack key={row.id} direction="row" spacing={1.5} sx={{ py: 1.3 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#DBEAFE', color: '#1D4ED8', fontSize: 12, fontWeight: 850 }}>
            {row.actor?.[0] || 'R'}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography fontWeight={800} sx={{ fontSize: 13.5 }}>{row.actor}</Typography>
              <Typography variant="body2" color="text.secondary">{row.action}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">{row.detail}</Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <StatusBadge value={row.status} />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

function DepartmentOverview({ rows }) {
  const totals = rows.reduce((acc, row) => ({
    requests: acc.requests + row.count,
    pending: acc.pending + row.pending,
    completed: acc.completed + row.completed,
    withoutHead: acc.withoutHead + (row.hasHead ? 0 : 1),
  }), { requests: 0, pending: 0, completed: 0, withoutHead: 0 });
  const topDepartments = rows.slice(0, 6);

  return (
    <Stack spacing={2}>
      <Grid container spacing={1.25}>
        <DepartmentSummaryCard label="Total Requests" value={totals.requests} helper="Across all departments" tone="info" />
        <DepartmentSummaryCard label="Pending Work" value={totals.pending} helper="Open workflow items" tone={totals.pending ? 'warning' : 'success'} />
        <DepartmentSummaryCard label="Completed" value={totals.completed} helper="Closed requests" tone="success" />
        <DepartmentSummaryCard label="Missing Heads" value={totals.withoutHead} helper="Departments needing setup" tone={totals.withoutHead ? 'error' : 'success'} />
      </Grid>

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 2 }}>No department request activity yet.</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {topDepartments.map((row) => (
            <Grid key={row.name} size={{ xs: 12, md: 6, xl: 4 }}>
              <DepartmentHealthCard row={row} />
            </Grid>
          ))}
        </Grid>
      )}

      {rows.length > topDepartments.length && (
        <Typography variant="caption" color="text.secondary">
          Showing top {topDepartments.length} departments by request volume out of {rows.length}.
        </Typography>
      )}
    </Stack>
  );
}

function DepartmentSummaryCard({ label, value, helper, tone }) {
  const color = toneColor(tone);
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Box sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={900} sx={{ color, mt: 0.4 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </Box>
    </Grid>
  );
}

function DepartmentHealthCard({ row }) {
  const attentionTone = row.attentionLevel === 'Setup Required'
    ? 'error'
    : row.attentionLevel === 'High Load'
      ? 'warning'
      : row.attentionLevel === 'Active'
        ? 'info'
        : 'success';
  const attentionColor = toneColor(attentionTone);
  const progressColor = row.completionRate >= 75 ? 'success' : row.completionRate >= 35 ? 'primary' : 'warning';

  return (
    <Box
      sx={{
        height: '100%',
        p: 1.6,
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
      }}
    >
      <Stack spacing={1.4}>
        <Stack direction="row" spacing={1.1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: '#E0F2FE', color: '#0369A1', fontSize: 13, fontWeight: 900 }}>{row.name[0]}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={900} noWrap>{row.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{row.head}</Typography>
            </Box>
          </Stack>
          <Chip
            size="small"
            label={row.attentionLevel}
            sx={{ flexShrink: 0, color: attentionColor, bgcolor: `${attentionColor}14`, fontWeight: 850, borderRadius: 1 }}
          />
        </Stack>

        <Grid container spacing={1}>
          <DepartmentMetric label="Requests" value={row.count} />
          <DepartmentMetric label="Pending" value={row.pending} tone={row.pending ? 'warning' : 'success'} />
          <DepartmentMetric label="Done" value={row.completed} tone="success" />
        </Grid>

        <Box>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.6 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850}>Completion</Typography>
            <Typography variant="caption" fontWeight={900}>{row.completionRate}%</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(row.completionRate, 100)}
            color={progressColor}
            sx={{ height: 7, borderRadius: 999, bgcolor: (theme) => theme.custom.semantic.paperSoft }}
          />
        </Box>
      </Stack>
    </Box>
  );
}

function DepartmentMetric({ label, value, tone = 'info' }) {
  return (
    <Grid size={{ xs: 4 }}>
      <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
        <Typography fontWeight={900} sx={{ color: toneColor(tone) }}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function EmployeeRequestOverview({ requests }) {
  const activeRequests = requests.filter((request) => !['CLOSED', 'DEPARTMENT_REJECTED', 'IT_REJECTED'].includes(request.status));
  const pendingApprovals = requests.filter((request) => ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING'].includes(request.status));
  const responseNeeded = requests.filter((request) => request.status === 'CLARIFICATION_REQUESTED');
  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 6);
  const statusRows = Object.entries(activeRequests.reduce((acc, request) => {
    acc[request.status] = (acc[request.status] || 0) + 1;
    return acc;
  }, {})).map(([status, count]) => ({ status, count }));

  const hasEmployeeWork = activeRequests.length || pendingApprovals.length || responseNeeded.length;

  if (!hasEmployeeWork) {
    return (
      <Panel title="My Recent Requests" subtitle="Your latest submitted software requests">
        <CompactRequestList rows={recentRequests} empty="You have not submitted any requests yet." />
      </Panel>
    );
  }

  return (
    <Grid container spacing={2}>
      {activeRequests.length > 0 && (
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Request Status Summary" subtitle="Current status of your active requests">
            <Stack spacing={1}>
              {statusRows.map((row) => (
                <Stack key={row.status} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', py: 0.8 }}>
                  <StatusBadge value={row.status} />
                  <Typography fontWeight={850}>{row.count}</Typography>
                </Stack>
              ))}
            </Stack>
          </Panel>
        </Grid>
      )}

      {pendingApprovals.length > 0 && (
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="My Pending Approvals / Clarifications" subtitle="Requests waiting for department or internal review">
            <CompactRequestList rows={pendingApprovals.slice(0, 5)} />
          </Panel>
        </Grid>
      )}

      {responseNeeded.length > 0 ? (
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Requests Needing My Response" subtitle="Clarifications requested from you">
            <CompactRequestList rows={responseNeeded.slice(0, 5)} emphasize />
          </Panel>
        </Grid>
      ) : (
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="My Recent Requests" subtitle="Latest request activity from your submissions">
            <CompactRequestList rows={recentRequests} />
          </Panel>
        </Grid>
      )}
    </Grid>
  );
}

function CompactRequestList({ rows, empty = 'No requests to show.', emphasize = false }) {
  if (!rows.length) {
    return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  }

  return (
    <Stack spacing={0.5}>
      {rows.map((request) => (
        <Stack
          key={request.id || request.request_number}
          component={Link}
          to={`/requests/${request.id}`}
          direction="row"
          spacing={1}
          sx={{
            textDecoration: 'none',
            color: 'inherit',
            alignItems: 'center',
            py: 1,
            px: 1,
            borderRadius: 1.5,
            bgcolor: emphasize ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
            '&:hover': { bgcolor: (theme) => theme.custom.semantic.paperSoft },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{request.title}</Typography>
            <Typography variant="caption" color="text.secondary">{shortRequestNumber(request.request_number)} · {formatEnum(request.request_type)}</Typography>
            {Number(request.progress_percentage || 0) > 0 && (
              <CompactProgress value={request.progress_percentage} />
            )}
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <StatusBadge value={request.status} />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

function DevelopmentProgressOverview({ requests }) {
  if (!requests.length) {
    return <Typography variant="body2" color="text.secondary">No active development progress yet.</Typography>;
  }

  const average = Math.round(requests.reduce((sum, request) => sum + Number(request.progress_percentage || 0), 0) / requests.length);

  return (
    <Stack spacing={1.25}>
      <Box sx={{ p: 1.25, borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>Average Completion</Typography>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 0.35 }}>
          <Typography variant="h5">{average}%</Typography>
          <LinearProgress
            variant="determinate"
            value={average}
            color={average >= 100 ? 'success' : 'primary'}
            sx={{ flex: 1, height: 8, borderRadius: 999, bgcolor: '#E2E8F0', '& .MuiLinearProgress-bar': { borderRadius: 999 } }}
          />
        </Stack>
      </Box>
      {requests.map((request) => (
        <Stack key={request.id || request.request_number} component={Link} to={`/requests/${request.id}`} spacing={0.5} sx={{ color: 'inherit', textDecoration: 'none', p: 1, borderRadius: 1.5, '&:hover': { bgcolor: (theme) => theme.custom.semantic.paperSoft } }}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', minWidth: 0 }}>
            <Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{request.title}</Typography>
            <Typography variant="caption" fontWeight={850}>{Number(request.progress_percentage || 0)}%</Typography>
          </Stack>
          <CompactProgress value={request.progress_percentage} />
        </Stack>
      ))}
    </Stack>
  );
}

function CompactProgress({ value }) {
  const progress = Number(value || 0);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.7 }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={progress >= 100 ? 'success' : 'primary'}
        sx={{ flex: 1, height: 6, borderRadius: 999, bgcolor: '#E2E8F0', '& .MuiLinearProgress-bar': { borderRadius: 999 } }}
      />
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{progress}% Complete</Typography>
    </Stack>
  );
}

function SystemOverview({ rows }) {
  return (
    <Stack spacing={1}>
      {rows.map(([label, value, icon]) => (
        <Stack key={label} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', py: 1.2, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
          </Stack>
          <Typography fontWeight={850}>{value}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function shortRequestNumber(value = '') {
  const match = String(value).match(/(\d{6})$/);
  return match ? `#${match[1]}` : value;
}

function MiniTrend({ color }) {
  return (
    <Stack direction="row" spacing={0.4} sx={{ alignItems: 'flex-end', mt: 1.5, height: 22 }}>
      {[35, 52, 44, 70, 58, 82, 76].map((height, index) => (
        <Box key={index} sx={{ width: 6, height: `${height}%`, borderRadius: 999, bgcolor: `${color}${index > 4 ? 'AA' : '55'}` }} />
      ))}
    </Stack>
  );
}

function toneColor(tone) {
  return {
    info: '#2563EB',
    warning: '#F59E0B',
    danger: '#DC2626',
    success: '#16A34A',
    purple: '#7C3AED',
    neutral: '#64748B',
  }[tone] || '#2563EB';
}

function buildRoleKpiCards(cards = []) {
  const metadata = {
    'Total Requests': { tone: 'info', icon: <GitPullRequest size={17} />, change: 'Organization-wide' },
    'Department Requests': { tone: 'info', icon: <GitPullRequest size={17} />, change: 'Department scope' },
    'My Requests': { tone: 'info', icon: <GitPullRequest size={17} />, change: 'Personal scope' },
    'Pending Approval': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Needs decision' },
    'Approved By Department': { tone: 'success', icon: <CheckCircle2 size={17} />, change: 'Approved locally' },
    'Waiting For More Information': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Requester response' },
    'Pending Internal Review': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Review queue' },
    'Internal Review': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Review queue' },
    'Waiting For Assignment': { tone: 'warning', icon: <Users size={17} />, change: 'Needs assignment' },
    'Team Assigned': { tone: 'success', icon: <Users size={17} />, change: 'Team assigned' },
    'Assigned Requests': { tone: 'info', icon: <Users size={17} />, change: 'Owned by you' },
    'Average Completion %': { tone: 'info', icon: <Code2 size={17} />, change: 'Work progress' },
    'Requests Behind Schedule': { tone: 'danger', icon: <ClipboardCheck size={17} />, change: 'Needs attention' },
    'Requests In Progress': { tone: 'success', icon: <Code2 size={17} />, change: 'Active work' },
    'Work In Progress': { tone: 'success', icon: <Code2 size={17} />, change: 'In progress' },
    'Ready To Start': { tone: 'warning', icon: <Code2 size={17} />, change: 'Ready to start' },
    'Sprint Planning': { tone: 'warning', icon: <GitPullRequest size={17} />, change: 'Task breakdown' },
    'Sprint Progress': { tone: 'info', icon: <Code2 size={17} />, change: 'Average task progress' },
    'My Sprint Tasks': { tone: 'info', icon: <Code2 size={17} />, change: 'Assigned tasks' },
    'Tasks In Progress': { tone: 'success', icon: <Code2 size={17} />, change: 'Active tasks' },
    'Tasks Blocked': { tone: 'danger', icon: <ClipboardCheck size={17} />, change: 'Needs PM help' },
    'Developer Workload': { tone: 'purple', icon: <Users size={17} />, change: 'Open assigned tasks' },
    Overdue: { tone: 'danger', icon: <ClipboardCheck size={17} />, change: 'Needs attention' },
    Completed: { tone: 'success', icon: <CheckCircle2 size={17} />, change: 'Completed work' },
    'Review & Validation': { tone: 'purple', icon: <TestTube2 size={17} />, change: 'Review queue' },
    'Pending Review': { tone: 'purple', icon: <TestTube2 size={17} />, change: 'Ready for review' },
    'In Review': { tone: 'purple', icon: <TestTube2 size={17} />, change: 'Under review' },
    Failed: { tone: 'danger', icon: <TestTube2 size={17} />, change: 'Needs rework' },
    Passed: { tone: 'success', icon: <CheckCircle2 size={17} />, change: 'Review passed' },
    'Final Approval': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Approval queue' },
    'Pending Final Approval': { tone: 'warning', icon: <ClipboardCheck size={17} />, change: 'Needs approval' },
    Approved: { tone: 'success', icon: <CheckCircle2 size={17} />, change: 'Accepted' },
    Rejected: { tone: 'danger', icon: <ClipboardCheck size={17} />, change: 'Rejected' },
    'Returned for Changes': { tone: 'danger', icon: <GitPullRequest size={17} />, change: 'Needs rework' },
    Closed: { tone: 'success', icon: <CheckCircle2 size={17} />, change: 'Completed' },
    'In Progress': { tone: 'success', icon: <Code2 size={17} />, change: 'Being worked' },
  };

  return cards.map((card) => ({
    title: card.label,
    value: card.value,
    ...(metadata[card.label] || { tone: 'neutral', icon: <GitPullRequest size={17} />, change: 'Role scoped' }),
  }));
}

function closureRate(counts) {
  return counts.total ? Math.round((counts.closed / counts.total) * 100) : 0;
}

function getDashboardCardValue(cards, label) {
  return cards.find((card) => card.label === label)?.value || 0;
}

