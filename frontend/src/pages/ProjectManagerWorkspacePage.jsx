import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { formatEnum } from '../utils/constants';

const moduleMeta = {
  dashboard: {
    eyebrow: 'PROJECT MANAGEMENT',
    title: 'Project Manager Dashboard',
    description: 'Track assigned projects from PM assignment through sprint execution and delivery.',
  },
  scopes: {
    eyebrow: 'SCOPE MANAGEMENT',
    title: 'Scope Management',
    description: 'Create, update, submit, and review scope definitions for assigned projects.',
  },
  stories: {
    eyebrow: 'USER STORY MANAGEMENT',
    title: 'User Story Management',
    description: 'Manage user stories, acceptance criteria, and Department HOD review outcomes.',
  },
  sprints: {
    eyebrow: 'SPRINT MANAGEMENT',
    title: 'Sprint Management',
    description: 'Plan, update, start, and complete delivery sprints.',
  },
  tasks: {
    eyebrow: 'SPRINT EXECUTION',
    title: 'Sprint Task Board',
    description: 'Manage sprint tasks, developer ownership, and delivery status.',
  },
};

const scopeFormDefaults = {
  scopeTitle: '',
  scopeDescription: '',
  businessObjectives: '',
  inScope: '',
  outOfScope: '',
  assumptions: '',
  dependencies: '',
};

const storyFormDefaults = {
  storyKey: '',
  title: '',
  description: '',
  acceptanceCriteria: '',
  priority: 'MEDIUM',
};

const sprintFormDefaults = {
  sprintName: '',
  goal: '',
  startDate: '',
  endDate: '',
  estimatedHours: '',
  actualHours: '',
};

const taskFormDefaults = {
  userStoryId: '',
  title: '',
  description: '',
  assignedDeveloperUserId: '',
  estimateHours: '',
  actualHours: '',
  priority: 'MEDIUM',
  status: 'TODO',
};

const kanbanColumns = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function normalizeDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'Not planned';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function requestStatusGroup(status) {
  if (['PM_ASSIGNED', 'SCOPE_REVIEW', 'USER_STORY_REVIEW'].includes(status)) return 'Planning';
  if (['DEVELOPER_ASSIGNED', 'SPRINT_PLANNING'].includes(status)) return 'Sprint Setup';
  if (['IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE'].includes(status)) return 'Development';
  if (['QA_PENDING', 'QA_FAILED', 'QA_PASSED', 'UAT_PENDING', 'UAT_FAILED', 'UAT_APPROVED'].includes(status)) return 'Review';
  if (['DEPLOYMENT_PENDING', 'DEPLOYED', 'CLOSED'].includes(status)) return 'Delivery';
  return 'Intake';
}

export function ProjectManagerDashboardPage() {
  return <ProjectManagerWorkspace mode="dashboard" />;
}

export function ScopeManagementPage() {
  return <ProjectManagerWorkspace mode="scopes" />;
}

export function UserStoryManagementPage() {
  return <ProjectManagerWorkspace mode="stories" />;
}

export function SprintManagementPage() {
  return <ProjectManagerWorkspace mode="sprints" />;
}

export function SprintTaskBoardPage() {
  return <ProjectManagerWorkspace mode="tasks" />;
}

export default function ProjectManagerWorkspace({ mode = 'dashboard' }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  const { user } = useAuth();
  const meta = moduleMeta[mode] || moduleMeta.dashboard;
  const [projects, setProjects] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [scopes, setScopes] = useState([]);
  const [stories, setStories] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [tasksBySprint, setTasksBySprint] = useState({});
  const [developers, setDevelopers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [scopeDialog, setScopeDialog] = useState({ open: false, item: null });
  const [storyDialog, setStoryDialog] = useState({ open: false, item: null });
  const [sprintDialog, setSprintDialog] = useState({ open: false, item: null });
  const [taskDialog, setTaskDialog] = useState({ open: false, item: null, sprintId: null });

  const selectedProject = projects.find((project) => String(project.id) === String(selectedRequestId));
  const selectedSprint = sprints[0];
  const selectedSprintTasks = selectedSprint ? tasksBySprint[selectedSprint.id] || [] : [];
  const canReviewScope = ['IT_HEAD', 'SYSTEM_ADMIN'].includes(user?.roleCode);
  const canReviewStories = ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'].includes(user?.roleCode);
  const canManagePmWork = ['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user?.roleCode);

  async function loadProjects() {
    setLoading(true);
    setError('');
    try {
      const requests = await api.get('/requests');
      const projectRows = (requests || []).filter((request) => (
        request.project_manager_user_id || ['ASSIGNMENT_PENDING', 'PM_ASSIGNED', 'SCOPE_REVIEW', 'USER_STORY_REVIEW', 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', 'IN_DEVELOPMENT', 'QA_PENDING', 'UAT_PENDING', 'DEPLOYMENT_PENDING'].includes(request.status)
      ));
      setProjects(projectRows);
      setSelectedRequestId((current) => current || (projectRows[0]?.id ? String(projectRows[0].id) : ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDevelopers() {
    try {
      const users = await api.get('/users');
      setDevelopers((users || []).filter((item) => item.role_code === 'DEVELOPER' && item.status === 'ACTIVE'));
    } catch {
      setDevelopers([]);
    }
  }

  async function loadProjectDetails(requestId = selectedRequestId) {
    if (!requestId) return;
    setDetailLoading(true);
    setError('');
    try {
      const [scopeRows, storyRows, sprintRows] = await Promise.all([
        api.get(`/requests/${requestId}/scopes`),
        api.get(`/requests/${requestId}/user-stories`),
        api.get(`/requests/${requestId}/sprints`),
      ]);
      setScopes(scopeRows || []);
      setStories(storyRows || []);
      setSprints(sprintRows || []);
      const taskPairs = await Promise.all((sprintRows || []).map(async (sprint) => {
        try {
          const tasks = await api.get(`/requests/${requestId}/sprints/${sprint.id}/tasks`);
          return [sprint.id, tasks || []];
        } catch {
          return [sprint.id, []];
        }
      }));
      setTasksBySprint(Object.fromEntries(taskPairs));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
    loadDevelopers();
  }, []);

  useEffect(() => {
    loadProjectDetails(selectedRequestId);
  }, [selectedRequestId]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => [project.request_number, project.title, project.requester_name, project.department_name, project.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q));
  }, [projects, query]);

  const summary = useMemo(() => ({
    assignedProjects: projects.length,
    scopeReview: projects.filter((project) => project.status === 'SCOPE_REVIEW').length,
    storyReview: projects.filter((project) => project.status === 'USER_STORY_REVIEW').length,
    sprintPlanning: projects.filter((project) => ['DEVELOPER_ASSIGNED', 'SPRINT_PLANNING'].includes(project.status)).length,
    activeSprints: sprints.filter((sprint) => sprint.status === 'ACTIVE').length,
    openTasks: Object.values(tasksBySprint).flat().filter((task) => !['DONE', 'CANCELLED'].includes(task.status)).length,
  }), [projects, sprints, tasksBySprint]);

  async function runAction(action, successMessage) {
    try {
      await action();
      setToast(successMessage);
      await Promise.all([loadProjects(), loadProjectDetails(selectedRequestId)]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveScope(values, item) {
    const payload = { ...values, status: 'DRAFT' };
    await runAction(
      () => item
        ? api.put(`/requests/${selectedRequestId}/scopes/${item.id}`, payload)
        : api.post(`/requests/${selectedRequestId}/scopes`, payload),
      item ? 'Scope updated successfully.' : 'Scope created successfully.',
    );
    setScopeDialog({ open: false, item: null });
  }

  async function saveStory(values, item) {
    const payload = { ...values, status: 'DRAFT' };
    await runAction(
      () => item
        ? api.put(`/requests/${selectedRequestId}/user-stories/${item.id}`, payload)
        : api.post(`/requests/${selectedRequestId}/user-stories`, payload),
      item ? 'User story updated successfully.' : 'User story created successfully.',
    );
    setStoryDialog({ open: false, item: null });
  }

  async function saveSprint(values, item) {
    const payload = {
      ...values,
      estimatedHours: values.estimatedHours === '' ? null : Number(values.estimatedHours),
      actualHours: values.actualHours === '' ? null : Number(values.actualHours),
      status: item?.status || 'PLANNED',
    };
    await runAction(
      () => item
        ? api.put(`/requests/${selectedRequestId}/sprints/${item.id}`, payload)
        : api.post(`/requests/${selectedRequestId}/sprints`, payload),
      item ? 'Sprint updated successfully.' : 'Sprint created successfully.',
    );
    setSprintDialog({ open: false, item: null });
  }

  async function saveTask(values, item, sprintId) {
    const payload = {
      ...values,
      userStoryId: values.userStoryId || null,
      assignedDeveloperUserId: values.assignedDeveloperUserId || null,
      estimateHours: values.estimateHours === '' ? null : Number(values.estimateHours),
      actualHours: values.actualHours === '' ? null : Number(values.actualHours),
    };
    await runAction(
      () => item
        ? api.put(`/requests/${selectedRequestId}/sprints/${sprintId}/tasks/${item.id}`, payload)
        : api.post(`/requests/${selectedRequestId}/sprints/${sprintId}/tasks`, payload),
      item ? 'Sprint task updated successfully.' : 'Sprint task created successfully.',
    );
    setTaskDialog({ open: false, item: null, sprintId: null });
  }

  return (
    <Page maxWidth={1500}>
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={(
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
            {mode === 'scopes' && canManagePmWork && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setScopeDialog({ open: true, item: null })} disabled={!selectedRequestId}>New Scope</Button>}
            {mode === 'stories' && canManagePmWork && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setStoryDialog({ open: true, item: null })} disabled={!selectedRequestId}>New Story</Button>}
            {mode === 'sprints' && canManagePmWork && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setSprintDialog({ open: true, item: null })} disabled={!selectedRequestId}>New Sprint</Button>}
            {mode === 'tasks' && canManagePmWork && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setTaskDialog({ open: true, item: null, sprintId: selectedSprint?.id })} disabled={!selectedSprint}>New Task</Button>}
            <Button variant="outlined" onClick={() => { loadProjects(); loadProjectDetails(selectedRequestId); }}>Refresh</Button>
          </Stack>
        )}
      />

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {loading && <LinearProgress />}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: mode === 'dashboard' ? 12 : 3.6 }}>
          <Stack spacing={2}>
            <ProjectSelector
              projects={filteredProjects}
              selectedRequestId={selectedRequestId}
              onSelect={setSelectedRequestId}
              query={query}
              onQuery={setQuery}
            />
            {mode !== 'dashboard' && selectedProject && <ProjectSnapshot project={selectedProject} summary={summary} />}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: mode === 'dashboard' ? 12 : 8.4 }}>
          {detailLoading ? (
            <Box sx={{ p: 3, border: `1px solid ${semantic.borderSoft}`, borderRadius: 2, bgcolor: semantic.elevated }}>
              <LinearProgress />
            </Box>
          ) : (
            <>
              {mode === 'dashboard' && <DashboardContent projects={filteredProjects} summary={summary} scopes={scopes} stories={stories} sprints={sprints} tasks={selectedSprintTasks} />}
              {mode === 'scopes' && <ScopeContent rows={scopes} onEdit={(item) => setScopeDialog({ open: true, item })} onSubmit={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/scopes/${item.id}/submit`), 'Scope submitted successfully.')} onApprove={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/scopes/${item.id}/approve`, { comment: 'Scope approved.' }), 'Scope approved successfully.')} onReject={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/scopes/${item.id}/reject`, { comment: 'Scope returned for rework.' }), 'Scope rejected successfully.')} canManage={canManagePmWork} canReview={canReviewScope} />}
              {mode === 'stories' && <StoryContent rows={stories} onEdit={(item) => setStoryDialog({ open: true, item })} onSubmit={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/user-stories/${item.id}/submit`), 'User story submitted successfully.')} onApprove={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/user-stories/${item.id}/approve`, { comment: 'User story approved.' }), 'User story approved successfully.')} onReject={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/user-stories/${item.id}/reject`, { comment: 'User story returned for rework.' }), 'User story rejected successfully.')} canManage={canManagePmWork} canReview={canReviewStories} />}
              {mode === 'sprints' && <SprintContent rows={sprints} onEdit={(item) => setSprintDialog({ open: true, item })} onStart={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/sprints/${item.id}/start`, { comment: 'Sprint started.' }), 'Sprint started successfully.')} onComplete={(item) => runAction(() => api.post(`/requests/${selectedRequestId}/sprints/${item.id}/complete`, { comment: 'Sprint completed.' }), 'Sprint completed successfully.')} canManage={canManagePmWork} />}
              {mode === 'tasks' && <TaskBoard sprints={sprints} tasksBySprint={tasksBySprint} developers={developers} selectedSprint={selectedSprint} onEdit={(item, sprintId) => setTaskDialog({ open: true, item, sprintId })} onStatus={(task, sprintId, status) => runAction(() => api.post(`/requests/${selectedRequestId}/sprints/${sprintId}/tasks/${task.id}/status`, { status }), 'Task status updated successfully.')} canManage={canManagePmWork} />}
            </>
          )}
        </Grid>
      </Grid>

      <ScopeDialog open={scopeDialog.open} item={scopeDialog.item} onClose={() => setScopeDialog({ open: false, item: null })} onSave={saveScope} />
      <StoryDialog open={storyDialog.open} item={storyDialog.item} onClose={() => setStoryDialog({ open: false, item: null })} onSave={saveStory} />
      <SprintDialog open={sprintDialog.open} item={sprintDialog.item} onClose={() => setSprintDialog({ open: false, item: null })} onSave={saveSprint} />
      <TaskDialog open={taskDialog.open} item={taskDialog.item} sprintId={taskDialog.sprintId} stories={stories} developers={developers} onClose={() => setTaskDialog({ open: false, item: null, sprintId: null })} onSave={saveTask} />
      <Snackbar open={Boolean(toast)} autoHideDuration={3200} onClose={() => setToast('')} message={toast} />
    </Page>
  );
}

function ProjectSelector({ projects, selectedRequestId, onSelect, query, onQuery }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Box sx={{ borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated, overflow: 'hidden' }}>
      <Stack spacing={1.25} sx={{ p: 2, borderBottom: `1px solid ${semantic.borderSoft}` }}>
        <Typography variant="subtitle1" fontWeight={700}>Project Requests</Typography>
        <TextField
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search projects"
          fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      </Stack>
      <Stack spacing={0.75} sx={{ p: 1.25, maxHeight: 520, overflow: 'auto', bgcolor: semantic.paperSoft }}>
        {projects.length === 0 ? (
          <EmptyState title="No projects found" description="Assigned projects will appear here." />
        ) : projects.map((project) => {
          const selected = String(project.id) === String(selectedRequestId);
          return (
            <Button
              key={project.id}
              onClick={() => onSelect(String(project.id))}
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                p: 1.25,
                borderRadius: 1.5,
                border: `1px solid ${selected ? theme.palette.primary.main : semantic.borderSoft}`,
                bgcolor: selected ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#EFF6FF') : semantic.elevated,
                color: 'text.primary',
              }}
            >
              <Stack spacing={0.75} sx={{ width: '100%', minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">{project.request_number}</Typography>
                  <Chip size="small" label={requestStatusGroup(project.status)} />
                </Stack>
                <Typography variant="body2" fontWeight={700} noWrap>{project.title}</Typography>
                <StatusBadge value={project.status} />
              </Stack>
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
}

function ProjectSnapshot({ project, summary }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" fontWeight={700}>Selected Project</Typography>
        <Typography variant="body2" color="text.secondary">{project.request_number}</Typography>
        <Typography variant="h6">{project.title}</Typography>
        <Divider />
        <MiniMetric label="Scope Review" value={summary.scopeReview} />
        <MiniMetric label="Story Review" value={summary.storyReview} />
        <MiniMetric label="Active Sprints" value={summary.activeSprints} />
        <MiniMetric label="Open Tasks" value={summary.openTasks} />
      </Stack>
    </Box>
  );
}

function DashboardContent({ projects, summary, scopes, stories, sprints, tasks }) {
  return (
    <Stack spacing={2}>
      <Grid container spacing={1.5}>
        <SummaryTile label="Assigned Projects" value={summary.assignedProjects} icon={<AssignmentOutlinedIcon />} />
        <SummaryTile label="Scope Review" value={summary.scopeReview} icon={<SendOutlinedIcon />} />
        <SummaryTile label="Story Review" value={summary.storyReview} icon={<TaskAltOutlinedIcon />} />
        <SummaryTile label="Sprint Planning" value={summary.sprintPlanning} icon={<PlayArrowOutlinedIcon />} />
      </Grid>
      <ModulePanel title="Project Portfolio">
        <ResponsiveTable
          columns={['ID', 'Title', 'Requester', 'Status', 'Stage']}
          rows={projects}
          renderRow={(project) => (
            <TableRow key={project.id} hover>
              <TableCell>{project.request_number}</TableCell>
              <TableCell><Typography fontWeight={650}>{project.title}</Typography></TableCell>
              <TableCell>{project.requester_name || 'Unknown'}</TableCell>
              <TableCell><StatusBadge value={project.status} /></TableCell>
              <TableCell>{requestStatusGroup(project.status)}</TableCell>
            </TableRow>
          )}
          empty="No project requests available."
        />
      </ModulePanel>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><SmallList title="Latest Scopes" rows={scopes} labelKey="scope_title" statusKey="status" /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><SmallList title="Latest User Stories" rows={stories} labelKey="title" statusKey="status" /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><SmallList title="Sprints" rows={sprints} labelKey="sprint_name" statusKey="status" /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><SmallList title="Sprint Tasks" rows={tasks} labelKey="title" statusKey="status" /></Grid>
      </Grid>
    </Stack>
  );
}

function ScopeContent({ rows, onEdit, onSubmit, onApprove, onReject, canManage, canReview }) {
  return (
    <ModulePanel title="Scope Definitions">
      <ResponsiveTable
        columns={['Scope', 'Created By', 'Status', 'Reviewed By', 'Actions']}
        rows={rows}
        renderRow={(scope) => (
          <TableRow key={scope.id} hover>
            <TableCell>
              <Typography fontWeight={700}>{scope.scope_title}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{scope.scope_description}</Typography>
            </TableCell>
            <TableCell>{scope.created_by_name || 'Project Manager'}</TableCell>
            <TableCell><StatusBadge value={scope.status} /></TableCell>
            <TableCell>{scope.reviewed_by_name || 'Not reviewed'}</TableCell>
            <TableCell>
              <RowActions>
                {canManage && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(scope)}>Edit</Button>}
                {canManage && <Button size="small" startIcon={<SendOutlinedIcon />} onClick={() => onSubmit(scope)} disabled={scope.status === 'APPROVED'}>Submit</Button>}
                {canReview && <Button size="small" color="success" onClick={() => onApprove(scope)} disabled={scope.status !== 'SUBMITTED'}>Approve</Button>}
                {canReview && <Button size="small" color="error" onClick={() => onReject(scope)} disabled={scope.status !== 'SUBMITTED'}>Reject</Button>}
              </RowActions>
            </TableCell>
          </TableRow>
        )}
        empty="No scope definitions yet."
      />
    </ModulePanel>
  );
}

function StoryContent({ rows, onEdit, onSubmit, onApprove, onReject, canManage, canReview }) {
  return (
    <ModulePanel title="User Stories">
      <ResponsiveTable
        columns={['Story', 'Priority', 'Status', 'Reviewed By', 'Actions']}
        rows={rows}
        renderRow={(story) => (
          <TableRow key={story.id} hover>
            <TableCell>
              <Typography fontWeight={700}>{story.story_key ? `${story.story_key} - ` : ''}{story.title}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{story.description}</Typography>
            </TableCell>
            <TableCell><StatusBadge value={story.priority} /></TableCell>
            <TableCell><StatusBadge value={story.status} /></TableCell>
            <TableCell>{story.reviewed_by_name || 'Not reviewed'}</TableCell>
            <TableCell>
              <RowActions>
                {canManage && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(story)}>Edit</Button>}
                {canManage && <Button size="small" startIcon={<SendOutlinedIcon />} onClick={() => onSubmit(story)} disabled={story.status === 'APPROVED'}>Submit</Button>}
                {canReview && <Button size="small" color="success" onClick={() => onApprove(story)} disabled={story.status !== 'SUBMITTED'}>Approve</Button>}
                {canReview && <Button size="small" color="error" onClick={() => onReject(story)} disabled={story.status !== 'SUBMITTED'}>Reject</Button>}
              </RowActions>
            </TableCell>
          </TableRow>
        )}
        empty="No user stories yet."
      />
    </ModulePanel>
  );
}

function SprintContent({ rows, onEdit, onStart, onComplete, canManage }) {
  return (
    <ModulePanel title="Sprints">
      <ResponsiveTable
        columns={['Sprint', 'Dates', 'Hours', 'Status', 'Actions']}
        rows={rows}
        renderRow={(sprint) => (
          <TableRow key={sprint.id} hover>
            <TableCell>
              <Typography fontWeight={700}>{sprint.sprint_name}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{sprint.goal || 'No goal added'}</Typography>
            </TableCell>
            <TableCell>{formatDate(sprint.start_date)} - {formatDate(sprint.end_date)}</TableCell>
            <TableCell>{sprint.estimated_hours || 0}h estimated</TableCell>
            <TableCell><StatusBadge value={sprint.status} /></TableCell>
            <TableCell>
              <RowActions>
                {canManage && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(sprint)}>Edit</Button>}
                {canManage && <Button size="small" startIcon={<PlayArrowOutlinedIcon />} onClick={() => onStart(sprint)} disabled={!['PLANNED', 'CREATED'].includes(sprint.status)}>Start</Button>}
                {canManage && <Button size="small" color="success" onClick={() => onComplete(sprint)} disabled={sprint.status !== 'ACTIVE'}>Complete</Button>}
              </RowActions>
            </TableCell>
          </TableRow>
        )}
        empty="No sprints planned yet."
      />
    </ModulePanel>
  );
}

function TaskBoard({ sprints, tasksBySprint, selectedSprint, developers, onEdit, onStatus, canManage }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  if (!selectedSprint) {
    return <ModulePanel title="Task Board"><EmptyState title="No sprint selected" description="Create a sprint before adding tasks." /></ModulePanel>;
  }
  const tasks = tasksBySprint[selectedSprint.id] || [];
  return (
    <Stack spacing={2}>
      <ModulePanel title={`Task Board - ${selectedSprint.sprint_name}`}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(5, minmax(180px, 1fr))' }, gap: 1.5 }}>
          {kanbanColumns.map((column) => (
            <Box key={column.value} sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paperSoft, minHeight: 260 }}>
              <Stack spacing={1.25}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" fontWeight={750}>{column.label}</Typography>
                  <Chip size="small" label={tasks.filter((task) => task.status === column.value).length} />
                </Stack>
                {tasks.filter((task) => task.status === column.value).map((task) => (
                  <Paper key={task.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: semantic.elevated }}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={750}>{task.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{task.assigned_developer_name || 'No developer assigned'}</Typography>
                      <StatusBadge value={task.priority} />
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                        {canManage && <Button size="small" onClick={() => onEdit(task, selectedSprint.id)}>Edit</Button>}
                        {kanbanColumns.filter((item) => item.value !== task.status).slice(0, 2).map((item) => (
                          <Button key={item.value} size="small" onClick={() => onStatus(task, selectedSprint.id, item.value)}>{item.label}</Button>
                        ))}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
                {tasks.filter((task) => task.status === column.value).length === 0 && (
                  <Typography variant="caption" color="text.secondary">No tasks</Typography>
                )}
              </Stack>
            </Box>
          ))}
        </Box>
      </ModulePanel>
      <Typography variant="caption" color="text.secondary">
        Developers available for assignment: {developers.length}
      </Typography>
    </Stack>
  );
}

function ScopeDialog({ open, item, onClose, onSave }) {
  const [values, setValues] = useState(scopeFormDefaults);
  useEffect(() => {
    setValues(item ? {
      scopeTitle: item.scope_title || '',
      scopeDescription: item.scope_description || '',
      businessObjectives: item.business_objectives || '',
      inScope: item.in_scope || '',
      outOfScope: item.out_of_scope || '',
      assumptions: item.assumptions || '',
      dependencies: item.dependencies || '',
    } : scopeFormDefaults);
  }, [item, open]);
  return (
    <EntityDialog open={open} title={item ? 'Edit Scope' : 'Create Scope'} onClose={onClose} onSave={() => onSave(values, item)}>
      <TextField label="Scope Title" value={values.scopeTitle} onChange={(event) => setValues({ ...values, scopeTitle: event.target.value })} fullWidth required />
      <TextField label="Scope Description" value={values.scopeDescription} onChange={(event) => setValues({ ...values, scopeDescription: event.target.value })} fullWidth multiline minRows={3} required />
      <TextField label="Business Objectives" value={values.businessObjectives} onChange={(event) => setValues({ ...values, businessObjectives: event.target.value })} fullWidth multiline minRows={2} />
      <TextField label="In Scope" value={values.inScope} onChange={(event) => setValues({ ...values, inScope: event.target.value })} fullWidth multiline minRows={2} />
      <TextField label="Out of Scope" value={values.outOfScope} onChange={(event) => setValues({ ...values, outOfScope: event.target.value })} fullWidth multiline minRows={2} />
      <TextField label="Assumptions" value={values.assumptions} onChange={(event) => setValues({ ...values, assumptions: event.target.value })} fullWidth />
      <TextField label="Dependencies" value={values.dependencies} onChange={(event) => setValues({ ...values, dependencies: event.target.value })} fullWidth />
    </EntityDialog>
  );
}

function StoryDialog({ open, item, onClose, onSave }) {
  const [values, setValues] = useState(storyFormDefaults);
  useEffect(() => {
    setValues(item ? {
      storyKey: item.story_key || '',
      title: item.title || '',
      description: item.description || '',
      acceptanceCriteria: item.acceptance_criteria || '',
      priority: item.priority || 'MEDIUM',
    } : storyFormDefaults);
  }, [item, open]);
  return (
    <EntityDialog open={open} title={item ? 'Edit User Story' : 'Create User Story'} onClose={onClose} onSave={() => onSave(values, item)}>
      <TextField label="Story Key" value={values.storyKey} onChange={(event) => setValues({ ...values, storyKey: event.target.value })} fullWidth />
      <TextField label="Title" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} fullWidth required />
      <TextField label="Description" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} fullWidth multiline minRows={3} required />
      <TextField label="Acceptance Criteria" value={values.acceptanceCriteria} onChange={(event) => setValues({ ...values, acceptanceCriteria: event.target.value })} fullWidth multiline minRows={3} required />
      <TextField select label="Priority" value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })} fullWidth>
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
      </TextField>
    </EntityDialog>
  );
}

function SprintDialog({ open, item, onClose, onSave }) {
  const [values, setValues] = useState(sprintFormDefaults);
  useEffect(() => {
    setValues(item ? {
      sprintName: item.sprint_name || '',
      goal: item.goal || '',
      startDate: normalizeDateInput(item.start_date),
      endDate: normalizeDateInput(item.end_date),
      estimatedHours: item.estimated_hours || '',
      actualHours: item.actual_hours || '',
    } : sprintFormDefaults);
  }, [item, open]);
  return (
    <EntityDialog open={open} title={item ? 'Edit Sprint' : 'Create Sprint'} onClose={onClose} onSave={() => onSave(values, item)}>
      <TextField label="Sprint Name" value={values.sprintName} onChange={(event) => setValues({ ...values, sprintName: event.target.value })} fullWidth required />
      <TextField label="Goal" value={values.goal} onChange={(event) => setValues({ ...values, goal: event.target.value })} fullWidth multiline minRows={2} />
      <TextField label="Start Date" type="date" value={values.startDate} onChange={(event) => setValues({ ...values, startDate: event.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
      <TextField label="End Date" type="date" value={values.endDate} onChange={(event) => setValues({ ...values, endDate: event.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
      <TextField label="Estimated Hours" type="number" value={values.estimatedHours} onChange={(event) => setValues({ ...values, estimatedHours: event.target.value })} fullWidth />
      <TextField label="Actual Hours" type="number" value={values.actualHours} onChange={(event) => setValues({ ...values, actualHours: event.target.value })} fullWidth />
    </EntityDialog>
  );
}

function TaskDialog({ open, item, sprintId, stories, developers, onClose, onSave }) {
  const [values, setValues] = useState(taskFormDefaults);
  useEffect(() => {
    setValues(item ? {
      userStoryId: item.user_story_id || '',
      title: item.title || '',
      description: item.description || '',
      assignedDeveloperUserId: item.assigned_developer_user_id || '',
      estimateHours: item.estimate_hours || '',
      actualHours: item.actual_hours || '',
      priority: item.priority || 'MEDIUM',
      status: item.status || 'TODO',
    } : taskFormDefaults);
  }, [item, open]);
  return (
    <EntityDialog open={open} title={item ? 'Edit Sprint Task' : 'Create Sprint Task'} onClose={onClose} onSave={() => onSave(values, item, sprintId)}>
      <TextField select label="User Story" value={values.userStoryId} onChange={(event) => setValues({ ...values, userStoryId: event.target.value })} fullWidth>
        <MenuItem value="">No linked story</MenuItem>
        {stories.map((story) => <MenuItem key={story.id} value={story.id}>{story.story_key ? `${story.story_key} - ` : ''}{story.title}</MenuItem>)}
      </TextField>
      <TextField label="Title" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} fullWidth required />
      <TextField label="Description" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} fullWidth multiline minRows={2} />
      <TextField select label="Assigned Developer" value={values.assignedDeveloperUserId} onChange={(event) => setValues({ ...values, assignedDeveloperUserId: event.target.value })} fullWidth>
        <MenuItem value="">Unassigned</MenuItem>
        {developers.map((developer) => <MenuItem key={developer.id} value={developer.id}>{developer.full_name}</MenuItem>)}
      </TextField>
      <TextField select label="Priority" value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })} fullWidth>
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
      </TextField>
      <TextField select label="Status" value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })} fullWidth>
        {kanbanColumns.map((status) => <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>)}
      </TextField>
      <TextField label="Estimate Hours" type="number" value={values.estimateHours} onChange={(event) => setValues({ ...values, estimateHours: event.target.value })} fullWidth />
      <TextField label="Actual Hours" type="number" value={values.actualHours} onChange={(event) => setValues({ ...values, actualHours: event.target.value })} fullWidth />
    </EntityDialog>
  );
}

function EntityDialog({ open, title, children, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          {title}
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function ModulePanel({ title, children }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Box sx={{ borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <Stack direction="row" sx={{ p: 2, alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${semantic.borderSoft}` }}>
        <Typography variant="h6">{title}</Typography>
      </Stack>
      <Box sx={{ p: { xs: 1.25, md: 2 }, bgcolor: semantic.paperSoft }}>{children}</Box>
    </Box>
  );
}

function ResponsiveTable({ columns, rows, renderRow, empty }) {
  if (!rows.length) return <EmptyState title={empty} description="Use the primary action in the page header to add records." />;
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            {columns.map((column) => <TableCell key={column}>{column}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>{rows.map(renderRow)}</TableBody>
      </Table>
    </TableContainer>
  );
}

function SummaryTile({ label, value, icon }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.elevated }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF' }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={750}>{value}</Typography>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
          </Box>
        </Stack>
      </Box>
    </Grid>
  );
}

function SmallList({ title, rows, labelKey, statusKey }) {
  return (
    <ModulePanel title={title}>
      <Stack spacing={1}>
        {rows.slice(0, 5).map((row) => (
          <Stack key={row.id} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" fontWeight={650} noWrap>{row[labelKey]}</Typography>
            <StatusBadge value={row[statusKey]} />
          </Stack>
        ))}
        {rows.length === 0 && <Typography variant="body2" color="text.secondary">No records yet.</Typography>}
      </Stack>
    </ModulePanel>
  );
}

function RowActions({ children }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', minWidth: 220 }}>
      {children}
    </Stack>
  );
}

function MiniMetric({ label, value }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={750}>{value}</Typography>
    </Stack>
  );
}

function EmptyState({ title, description }) {
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 150, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="subtitle1" color="text.primary">{title}</Typography>
      {description && <Typography variant="body2">{description}</Typography>}
    </Stack>
  );
}
