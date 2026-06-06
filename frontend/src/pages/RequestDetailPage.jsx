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
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { CheckCircle2, CircleHelp, PauseCircle, PlayCircle, Send, XCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import StatusBadge from '../components/StatusBadge';
import { PageSkeleton } from '../components/LoadingState';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { formatEnum, missingReportingAuthorityText, priorities } from '../utils/constants';

const workflowSteps = [
  { key: 'SUBMITTED', label: 'Submitted', description: 'Request captured', matches: ['SUBMITTED'] },
  { key: 'DEPARTMENT_APPROVAL_PENDING', label: 'Department Approval', description: 'Business approval review', matches: ['DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED', 'DEPARTMENT_REJECTED'] },
  { key: 'IT_REVIEW_PENDING', label: 'Internal Review', description: 'Feasibility and priority review', matches: ['IT_REVIEW_PENDING', 'IT_REJECTED', 'DEFERRED'] },
  { key: 'ASSIGNMENT_PENDING', label: 'Waiting For Assignment', description: 'Team member and reviewer selection', matches: ['ASSIGNMENT_PENDING'] },
  { key: 'ASSIGNED', label: 'Team Assigned', description: 'Team assignment confirmed', matches: ['ASSIGNED'] },
  { key: 'IN_DEVELOPMENT', label: 'Work In Progress', description: 'Active implementation', matches: ['IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE'] },
  { key: 'IN_TESTING', label: 'Review & Validation', description: 'Quality review and validation', matches: ['IN_TESTING', 'TEST_FAILED'] },
  { key: 'UAT_PENDING', label: 'Final Approval', description: 'Final business approval', matches: ['UAT_PENDING', 'UAT_REJECTED'] },
  { key: 'CLOSED', label: 'Completed', description: 'Request completed', matches: ['CLOSED'] },
];

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

const progressVisibleStatuses = new Set([
  'ASSIGNED',
  'IN_DEVELOPMENT',
  'DEVELOPMENT_COMPLETE',
  'IN_TESTING',
  'TEST_FAILED',
  'UAT_PENDING',
  'UAT_APPROVED',
  'UAT_REJECTED',
  'DEPLOYED',
  'CLOSED',
]);

const workflowSuccessMessages = {
  '/department-approval/approve': 'Request approved successfully.',
  '/department-approval/reject': 'Request rejected successfully.',
  '/department-approval/request-clarification': 'Clarification requested successfully.',
  '/clarification/respond': 'Clarification response submitted successfully.',
  '/it-review/approve': 'Request approved successfully.',
  '/it-review/reject': 'Request rejected successfully.',
  '/it-review/request-clarification': 'Clarification requested successfully.',
  '/it-review/defer': 'Request deferred successfully.',
  '/assign': 'Developer assigned successfully.',
  '/development/start': 'Request moved to Development.',
  '/development/update': 'Development progress updated successfully.',
  '/development/complete': 'Development completed successfully.',
  '/testing/result': 'Testing result submitted successfully.',
  '/testing/request-clarification': 'Clarification requested successfully.',
  '/uat/approve': 'Request approved successfully.',
  '/uat/reject': 'Request rejected successfully.',
  '/uat/request-clarification': 'Clarification requested successfully.',
};

const notificationActionPaths = new Set([
  '/department-approval/approve',
  '/department-approval/reject',
  '/department-approval/request-clarification',
  '/clarification/respond',
  '/it-review/approve',
  '/it-review/reject',
  '/it-review/request-clarification',
  '/assign',
  '/development/update',
  '/development/complete',
  '/testing/result',
  '/testing/request-clarification',
  '/uat/approve',
  '/uat/reject',
  '/uat/request-clarification',
]);

const clarificationReasons = [
  { value: 'MISSING_BUSINESS_JUSTIFICATION', label: 'Missing Business Justification' },
  { value: 'MISSING_REQUIREMENTS', label: 'Missing Requirements' },
  { value: 'MISSING_BENEFITS', label: 'Missing Benefits' },
  { value: 'MISSING_ATTACHMENT', label: 'Missing Attachment' },
  { value: 'TECHNICAL_CLARIFICATION', label: 'Internal Review Clarification' },
  { value: 'OTHER', label: 'Other' },
];

function shortRequestNumber(value) {
  const match = String(value || '').match(/(\d{6})$/);
  return match ? `#${match[1]}` : value || 'Request';
}

function formatDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFullDateTime(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function hasDevelopmentVisibility(request) {
  return Boolean(request?.active_assignment_id || progressVisibleStatuses.has(request?.status));
}

function normalizeRoiFromRequest(request) {
  return {
    roiType: request?.roi_type || '',
    roiHoursSavedPerEmployeePerMonth: request?.roi_hours_saved_per_employee_per_month ?? '',
    roiEmployeesBenefited: request?.roi_employees_benefited ?? '',
    roiMonthlyCostSavingsInr: request?.roi_monthly_cost_savings_inr ?? '',
  };
}

function calculateRoi(values) {
  if (values.roiType === 'TIME_SAVINGS') {
    const monthly = Number(values.roiHoursSavedPerEmployeePerMonth || 0) * Number(values.roiEmployeesBenefited || 0);
    return {
      typeLabel: 'Time Savings',
      inputLabel: `${Number(values.roiHoursSavedPerEmployeePerMonth || 0).toLocaleString('en-IN')} hours x ${Number(values.roiEmployeesBenefited || 0).toLocaleString('en-IN')} employees`,
      monthlyLabel: `${monthly.toLocaleString('en-IN')} productive hours/month`,
      annualLabel: `${(monthly * 12).toLocaleString('en-IN')} productive hours/year`,
    };
  }
  if (values.roiType === 'COST_SAVINGS') {
    const monthly = Number(values.roiMonthlyCostSavingsInr || 0);
    return {
      typeLabel: 'Cost Savings',
      inputLabel: `₹${monthly.toLocaleString('en-IN')} per month`,
      monthlyLabel: `₹${monthly.toLocaleString('en-IN')} monthly savings`,
      annualLabel: `₹${(monthly * 12).toLocaleString('en-IN')} annual savings`,
    };
  }
  return {
    typeLabel: 'Not specified',
    inputLabel: 'No ROI information has been provided.',
    monthlyLabel: 'Not available',
    annualLabel: 'Not available',
  };
}

function daysBetween(value) {
  if (!value) return 0;
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}

function getCurrentWorkflowStep(status) {
  if (status === 'CLARIFICATION_REQUESTED') {
    return { label: 'Waiting For More Information', description: 'Requester response required' };
  }
  if (status === 'ASSIGNED') {
    return { label: 'Team Assigned', description: 'Team assignment confirmed' };
  }
  return workflowSteps.find((step) => step.matches.includes(status)) || workflowSteps[0];
}

function getLatestStageChange(timeline, status) {
  return [...timeline].reverse().find((item) => item.to_status === status)?.changed_at;
}

function getSlaStatus(days) {
  if (days <= 2) return { label: 'On track', color: 'success.main' };
  if (days <= 5) return { label: 'Watching', color: 'warning.main' };
  return { label: 'At risk', color: 'error.main' };
}

function formatClarificationReason(value) {
  return clarificationReasons.find((reason) => reason.value === value)?.label || formatEnum(value);
}

function getProgressStatusLabel(value = 0) {
  const progress = Number(value || 0);
  if (progress >= 100) return 'Ready for Review';
  if (progress >= 90) return 'Near Completion';
  if (progress >= 60) return 'Work Ongoing';
  if (progress >= 35) return 'In Progress';
  if (progress >= 10) return 'Started';
  return 'Not Started';
}

function workloadStatusLabel(value) {
  return {
    AVAILABLE: 'Available',
    MODERATE: 'Moderate',
    OVERLOADED: 'Overloaded',
  }[value] || 'Available';
}

function progressBarColor(value = 0) {
  const progress = Number(value || 0);
  if (progress >= 100) return 'success';
  if (progress >= 75) return 'primary';
  if (progress >= 35) return 'info';
  return 'warning';
}

function getReportedToName(request) {
  return request?.reported_to_name || request?.department_head_name || missingReportingAuthorityText;
}

export default function RequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobileLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const [request, setRequest] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [comments, setComments] = useState([]);
  const [clarifications, setClarifications] = useState([]);
  const [progressUpdates, setProgressUpdates] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [users, setUsers] = useState([]);
  const [developerWorkloads, setDeveloperWorkloads] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [review, setReview] = useState({ feasibilityNotes: '', complexity: 'MEDIUM', estimatedEffort: '', priorityConfirmation: 'MEDIUM' });
  const [assignment, setAssignment] = useState({ developerUserId: '', qaUserId: '', notes: '' });
  const [progress, setProgress] = useState({ progressPercentage: 25, updateNotes: '', attachment: null });
  const [testResult, setTestResult] = useState({ result: 'PASS', testSummary: '', defectsFound: '' });
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [clarificationAction, setClarificationAction] = useState(null);
  const [clarificationForm, setClarificationForm] = useState({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ title: '', businessJustification: '', description: '', expectedBenefits: '' });
  const [roiEditing, setRoiEditing] = useState(false);
  const [roiForm, setRoiForm] = useState(normalizeRoiFromRequest(null));
  const [reportOpen, setReportOpen] = useState(false);

  const developers = useMemo(() => users.filter((row) => row.status === 'ACTIVE' && row.role_code === 'DEVELOPER'), [users]);
  const workloadByDeveloper = useMemo(() => new Map(developerWorkloads.map((item) => [Number(item.id), item])), [developerWorkloads]);
  const qaUsers = useMemo(() => users.filter((row) => row.status === 'ACTIVE' && row.role_code === 'QA'), [users]);
  const currentStep = useMemo(() => getCurrentWorkflowStep(request?.status), [request?.status]);
  const stageStartedAt = useMemo(
    () => getLatestStageChange(timeline, request?.status) || request?.updated_at || request?.created_at,
    [timeline, request],
  );
  const daysInStage = useMemo(() => daysBetween(stageStartedAt), [stageStartedAt]);
  const slaStatus = useMemo(() => getSlaStatus(daysInStage), [daysInStage]);
  const recentActivity = useMemo(() => [...timeline].reverse().slice(0, 6), [timeline]);
  const openClarification = useMemo(() => clarifications.find((item) => item.status === 'OPEN'), [clarifications]);
  const latestRequesterUpdate = useMemo(() => clarifications
    .filter((item) => item.status === 'RESOLVED' && item.response_note)
    .sort((a, b) => new Date(b.responded_at || 0) - new Date(a.responded_at || 0))[0], [clarifications]);
  const showWorkflowProgress = useMemo(() => hasDevelopmentVisibility(request), [request]);
  const canEditRoi = useMemo(() => {
    if (!request) return false;
    return user?.roleCode === 'SYSTEM_ADMIN' || (user?.roleCode === 'DEPARTMENT_HEAD' && Number(request.reported_to_user_id || request.department_head_user_id) === Number(user?.id));
  }, [request, user]);

  async function load() {
    const [detail, history, requestComments, requestClarifications, requestProgressUpdates, requestAttachments] = await Promise.all([
      api.get(`/requests/${id}`),
      api.get(`/requests/${id}/timeline`),
      api.get(`/requests/${id}/comments`),
      api.get(`/requests/${id}/clarifications`),
      api.get(`/requests/${id}/development-updates`),
      api.get(`/requests/${id}/attachments`),
    ]);
    setRequest(detail);
    setTimeline(history);
    setComments(requestComments);
    setClarifications(requestClarifications);
    setProgressUpdates(requestProgressUpdates);
    setAttachments(requestAttachments);
    setRoiForm(normalizeRoiFromRequest(detail));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    if (['SYSTEM_ADMIN', 'IT_HEAD', 'PROJECT_MANAGER'].includes(user?.roleCode)) {
      api.get('/users').then(setUsers).catch(() => setUsers([]));
      api.get('/developer-workload').then((result) => setDeveloperWorkloads(result.developers || [])).catch(() => setDeveloperWorkloads([]));
    } else {
      setUsers([]);
      setDeveloperWorkloads([]);
    }
  }, [id, user?.roleCode]);

  async function runAction(path, payload = {}, successMessage = 'Action completed.') {
    setError('');
    setMessage('');
    try {
      const result = await api.post(`/requests/${id}${path}`, payload);
      setMessage(successMessage === 'Action completed.' ? workflowSuccessMessages[path] || successMessage : successMessage);
      if (result?.notificationEmails?.length) {
        window.setTimeout(() => setMessage(`Email dispatched to ${result.notificationEmails[0]}`), 650);
      } else if (notificationActionPaths.has(path)) {
        window.setTimeout(() => setMessage('Notification email dispatched successfully.'), 650);
      }
      setActionComment('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addComment(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    await runAction('/comments', { commentText: comment, commentType: 'GENERAL' }, 'Comment added successfully.');
    setComment('');
  }

  function openClarificationModal(action) {
    setClarificationAction(action);
    setClarificationForm({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  }

  async function submitClarificationRequest(event) {
    event.preventDefault();
    if (!clarificationAction) return;
    setError('');
    setMessage('');
    try {
      await api.post(`/requests/${id}${clarificationAction.path}`, clarificationForm);
      setMessage('Clarification requested.');
      setClarificationAction(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function openDetailsDialog() {
    setDetailsForm({
      title: request.title || '',
      businessJustification: request.business_justification || '',
      description: request.description || '',
      expectedBenefits: request.expected_benefits || '',
    });
    setDetailsDialogOpen(true);
  }

  async function submitDetailsUpdate(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post(`/requests/${id}/details`, detailsForm);
      setMessage('Request details updated.');
      setDetailsDialogOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadAttachment(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      await api.post(`/requests/${id}/attachments`, data);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function submitRoiUpdate(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post(`/requests/${id}/roi`, {
        roiType: roiForm.roiType || null,
        roiHoursSavedPerEmployeePerMonth: roiForm.roiType === 'TIME_SAVINGS' ? Number(roiForm.roiHoursSavedPerEmployeePerMonth || 0) : null,
        roiEmployeesBenefited: roiForm.roiType === 'TIME_SAVINGS' ? Number(roiForm.roiEmployeesBenefited || 0) : null,
        roiMonthlyCostSavingsInr: roiForm.roiType === 'COST_SAVINGS' ? Number(roiForm.roiMonthlyCostSavingsInr || 0) : null,
      });
      setMessage('ROI information updated successfully.');
      setRoiEditing(false);
      await load();
      window.setTimeout(() => setMessage('Notification email dispatched successfully.'), 650);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openReport() {
    setReportOpen(true);
    api.post(`/requests/${id}/report/audit`).catch(() => {});
  }

  if (!request) return <PageSkeleton />;

  return (
    <Page maxWidth={1560}>
      <Snackbar
        open={Boolean(message)}
        autoHideDuration={4200}
        onClose={() => setMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{
          position: 'fixed',
          zIndex: (theme) => theme.zIndex.snackbar + 1000,
          '& .MuiAlert-root': {
            width: { xs: 'calc(100vw - 32px)', sm: 420 },
            boxShadow: (theme) => theme.custom.tokens.shadows.hover,
          },
        }}
      >
        <Alert severity="success" variant="filled" onClose={() => setMessage('')}>
          {message}
        </Alert>
      </Snackbar>
      {error && <Alert severity="error">{error}</Alert>}

      <WorkItemHeader request={request} onViewReport={openReport} />

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 8.4fr) minmax(320px, 3.6fr)' },
          alignItems: 'flex-start',
        }}
      >
        <Box sx={{ order: { xs: 1, lg: 1 }, gridColumn: { lg: '1 / 2' } }}>
          <WorkspacePanel title="Request Information">
            <Grid container spacing={0}>
              <MetaItem label="Requester" value={request.requester_name} />
              <MetaItem label="Department" value={request.department_name} />
              <MetaItem label="Type" value={formatEnum(request.request_type)} />
              <MetaItem label="Priority" value={<StatusBadge value={request.priority} />} />
              <MetaItem label="Reported To" value={getReportedToName(request)} />
              <MetaItem label="Created" value={formatDate(request.created_at)} />
              <MetaItem label="Updated" value={formatDate(request.updated_at)} />
              <MetaItem label="Full ID" value={request.request_number} />
            </Grid>
          </WorkspacePanel>
        </Box>

        <Box sx={{ order: { xs: 2, lg: 2 }, gridColumn: { lg: '1 / 2' } }}>
          <WorkspacePanel title="Business Context">
            <Stack spacing={2.25}>
              {request.status === 'CLARIFICATION_REQUESTED' && openClarification && (
                <ClarificationRequestCard
                  clarification={openClarification}
                  canUpdate={request.requester_user_id === user?.id || user?.roleCode === 'SYSTEM_ADMIN'}
                  onUpdate={openDetailsDialog}
                />
              )}
              <TextBlock label="Business Justification" value={request.business_justification} />
              <TextBlock label="Description" value={request.description} />
              <TextBlock label="Expected Benefits" value={request.expected_benefits || 'Not provided'} />
            </Stack>
          </WorkspacePanel>
        </Box>

        <Box sx={{ order: { xs: 3, lg: 3 }, gridColumn: { lg: '1 / 2' } }}>
          <RoiInformationPanel
            request={request}
            canEdit={canEditRoi}
            editing={roiEditing}
            setEditing={setRoiEditing}
            form={roiForm}
            setForm={setRoiForm}
            onSubmit={submitRoiUpdate}
          />
        </Box>

        <Box sx={{ order: { xs: 4, lg: 4 }, gridColumn: { lg: '1 / 2' } }}>
          <WorkspacePanel
            title="Attachments"
            caption={`${attachments.length} ${attachments.length === 1 ? 'file' : 'files'}`}
            action={(
              <Button variant="outlined" component="label" size="small" startIcon={<UploadFileIcon />}>
                Upload
                <input hidden type="file" onChange={uploadAttachment} />
              </Button>
            )}
          >
            {attachments.length === 0 ? (
              <EmptyInline message="No attachments uploaded yet." />
            ) : (
              <Grid container spacing={1.25}>
                {attachments.map((attachment) => (
                  <Grid key={attachment.id} size={{ xs: 12, md: 6 }}>
                    <AttachmentCard attachment={attachment} requestId={id} onPreview={setPreviewAttachment} />
                  </Grid>
                ))}
              </Grid>
            )}
          </WorkspacePanel>
        </Box>

        <Box sx={{ order: { xs: 5, lg: 1 }, gridColumn: { lg: '2 / 3' }, gridRow: { lg: '1 / span 6' } }}>
          <Stack spacing={2} sx={{ minWidth: 0, pr: { lg: 0.25 }, position: { lg: 'sticky' }, top: { lg: 82 } }}>
            <CurrentStageCard
              currentStep={currentStep}
              owner={getReportedToName(request)}
              daysInStage={daysInStage}
              slaStatus={slaStatus}
            />

            <WorkflowActions
              request={request}
              user={user}
              actionComment={actionComment}
              setActionComment={setActionComment}
              runAction={runAction}
              review={review}
              setReview={setReview}
              assignment={assignment}
              setAssignment={setAssignment}
              developers={developers}
              workloadByDeveloper={workloadByDeveloper}
              qaUsers={qaUsers}
              progress={progress}
              setProgress={setProgress}
              testResult={testResult}
              setTestResult={setTestResult}
              openClarificationModal={openClarificationModal}
              latestRequesterUpdate={latestRequesterUpdate}
              clarifications={clarifications}
              attachments={attachments}
            />

          </Stack>
        </Box>

        <Box sx={{ order: { xs: 6, lg: 5 }, gridColumn: { lg: '1 / 2' } }}>
          <WorkspacePanel title="Comments" caption={`${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}>
            <Stack component="form" direction={{ xs: 'column', md: 'row' }} spacing={1.25} onSubmit={addComment}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 13, fontWeight: 850 }}>
                {user?.fullName?.[0] || user?.email?.[0] || '?'}
              </Avatar>
              <TextField
                label="Add a comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <Button type="submit" variant="contained" sx={{ alignSelf: { md: 'flex-start' } }}>Post</Button>
            </Stack>

            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {comments.length === 0 ? (
                <EmptyInline message="No comments yet. Start the discussion with the next action or update." />
              ) : comments.map((item) => (
                <CommentItem key={item.id} comment={item} />
              ))}
            </Stack>
          </WorkspacePanel>
        </Box>

        {showWorkflowProgress && (
          <Box sx={{ order: { xs: 7, lg: 2 }, gridColumn: { lg: '2 / 3' } }}>
            <WorkflowTimeline status={request.status} timeline={timeline} />
          </Box>
        )}

        {showWorkflowProgress && (
          <Box sx={{ order: { xs: 8, lg: 6 }, gridColumn: { lg: '1 / 2' } }}>
            <DevelopmentProgressPanel request={request} progressUpdates={progressUpdates} />
          </Box>
        )}

        <Box sx={{ order: { xs: 9, lg: 3 }, gridColumn: { lg: '2 / 3' } }}>
          <RecentActivity items={recentActivity} clarifications={clarifications} />
        </Box>
      </Box>

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        requestId={id}
        onClose={() => setPreviewAttachment(null)}
        fullScreen={isMobileLayout}
      />
      <RequestMoreInformationDialog
        action={clarificationAction}
        form={clarificationForm}
        setForm={setClarificationForm}
        onClose={() => setClarificationAction(null)}
        onSubmit={submitClarificationRequest}
        fullScreen={isMobileLayout}
      />
      <UpdateRequestDetailsDialog
        open={detailsDialogOpen}
        form={detailsForm}
        setForm={setDetailsForm}
        onClose={() => setDetailsDialogOpen(false)}
        onSubmit={submitDetailsUpdate}
        fullScreen={isMobileLayout}
      />
      <RequestReportDialog
        open={reportOpen}
        request={request}
        attachments={attachments}
        timeline={timeline}
        comments={comments}
        progressUpdates={progressUpdates}
        onClose={() => setReportOpen(false)}
        fullScreen={isMobileLayout}
      />
    </Page>
  );
}

function WorkItemHeader({ request, onViewReport }) {
  async function copyRequestNumber() {
    await navigator.clipboard?.writeText(request.request_number);
  }

  return (
    <PageHeader
      eyebrow="REQUEST DETAILS"
      title={request.title}
      description={(
        <Stack spacing={0.8}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.8, flexWrap: 'wrap' }}>
            <Tooltip title={request.request_number}>
              <Typography variant="caption" color="primary.main" fontWeight={900}>
                {shortRequestNumber(request.request_number)}
              </Typography>
            </Tooltip>
            <Tooltip title="Copy full request ID">
              <Button size="small" color="inherit" onClick={copyRequestNumber} sx={{ minWidth: 0, px: 0.75 }}>
                <ContentCopyIcon sx={{ fontSize: 15 }} />
              </Button>
            </Tooltip>
            <StatusBadge value={request.status} />
            <StatusBadge value={request.priority} />
          </Stack>
        </Stack>
      )}
      actions={(
        <Stack spacing={1.25} sx={{ alignItems: { xs: 'stretch', lg: 'flex-end' }, width: { xs: '100%', lg: 'auto' } }}>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
            <HeaderMeta label="Requester" value={request.requester_name} />
            <HeaderMeta label="Department" value={request.department_name} />
            <HeaderMeta label="Created" value={formatDate(request.created_at)} />
            <HeaderMeta label="Updated" value={formatDate(request.updated_at)} />
          </Stack>
          <Button variant="outlined" size="small" onClick={onViewReport} sx={{ alignSelf: { xs: 'flex-start', lg: 'flex-end' } }}>
            View As Report
          </Button>
        </Stack>
      )}
    />
  );
}

function HeaderMeta({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={760}>{label}</Typography>
      <Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  );
}

function WorkspacePanel({ title, caption, action, children }) {
  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{
          px: 2,
          py: 1.4,
          borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => theme.custom.semantic.paperSoft,
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={850}>{title}</Typography>
          {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

function SidebarPanel({ title, children, emphasized = false }) {
  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: (theme) => `1px solid ${emphasized ? theme.palette.primary.main : theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => emphasized
          ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.10)' : '#F8FBFF')
          : theme.custom.semantic.elevated,
        boxShadow: emphasized ? '0 14px 34px rgba(37,99,235,0.10)' : '0 1px 2px rgba(15,23,42,0.04)',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 1.35, borderBottom: (theme) => `1px solid ${emphasized ? 'rgba(37,99,235,0.22)' : theme.custom.semantic.borderSoft}`, bgcolor: (theme) => emphasized ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.12)' : '#EFF6FF') : theme.custom.semantic.paperSoft }}>
        <Typography variant="subtitle2" fontWeight={850}>{title}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

function CurrentStageCard({ currentStep, owner, daysInStage, slaStatus }) {
  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.palette.primary.main}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.12)' : '#F8FBFF',
        boxShadow: '0 14px 36px rgba(29,78,216,0.10)',
        p: 2,
      }}
    >
      <Typography variant="caption" color="primary.main" fontWeight={900}>Current Stage</Typography>
      <Typography variant="h6" sx={{ mt: 0.4 }}>{currentStep.label}</Typography>
      <Grid container spacing={1.25} sx={{ mt: 1 }}>
        <StageMetric label="Reported To" value={owner} />
        <StageMetric label="Days in Stage" value={`${daysInStage} day${daysInStage === 1 ? '' : 's'}`} />
        <StageMetric label="SLA Status" value={slaStatus.label} tone={slaStatus} />
      </Grid>
    </Box>
  );
}

function StageMetric({ label, value, tone }) {
  return (
    <Grid size={{ xs: 12, sm: 4, lg: 12 }}>
      <Box sx={{ p: 1.15, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paper, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <Typography variant="caption" color="text.secondary" fontWeight={760}>{label}</Typography>
        <Typography variant="body2" fontWeight={850} color={tone?.color || 'text.primary'} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function WorkflowTimeline({ status, timeline }) {
  const reachedStatuses = new Set(timeline.map((item) => item.to_status));
  const currentIndex = workflowSteps.findIndex((step) => step.matches.includes(status));

  return (
    <SidebarPanel title="Workflow Progress">
      <Stack spacing={0}>
        {workflowSteps.map((step, index) => {
          const active = step.matches.includes(status);
          const completed = index < currentIndex || (reachedStatuses.has(step.key) && !active);
          const event = [...timeline].reverse().find((item) => step.matches.includes(item.to_status));
          return (
            <TimelineStep
              key={step.key}
              step={step}
              completed={completed}
              active={active}
              event={event}
              isLast={index === workflowSteps.length - 1}
            />
          );
        })}
      </Stack>
    </SidebarPanel>
  );
}

function TimelineStep({ step, completed, active, event, isLast }) {
  return (
    <Stack direction="row" spacing={1.2} sx={{ pb: isLast ? 0 : 1.4 }}>
      <Stack sx={{ alignItems: 'center', width: 26, flexShrink: 0 }}>
        <Box
          sx={{
            width: active ? 26 : 22,
            height: active ? 26 : 22,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: completed ? '#FFFFFF' : active ? 'primary.main' : 'text.disabled',
            bgcolor: (theme) => {
              if (completed) return theme.palette.success.main;
              if (active) return theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#EFF6FF';
              return theme.custom.semantic.paperSoft;
            },
            border: (theme) => active ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.custom.semantic.border}`,
            boxShadow: active ? '0 0 0 4px rgba(37,99,235,0.10)' : 'none',
          }}
        >
          {completed ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: active ? 13 : 12 }} />}
        </Box>
        {!isLast && (
          <Box
            sx={{
              width: 2,
              flex: 1,
              minHeight: 28,
              mt: 0.55,
              borderRadius: 99,
              bgcolor: (theme) => completed ? theme.palette.success.main : theme.custom.semantic.borderSoft,
            }}
          />
        )}
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={active ? 880 : 740} color={active ? 'primary.main' : 'text.primary'}>
          {step.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">{step.description}</Typography>
        {event && (
          <Box sx={{ mt: 0.45 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
              {formatFullDateTime(event.changed_at)}
            </Typography>
            <Typography variant="caption" color="text.primary" sx={{ display: 'block', lineHeight: 1.35, fontWeight: 760 }}>
              {event.changed_by_name} {event.comment || formatEnum(event.to_status)}
            </Typography>
          </Box>
        )}
      </Box>
    </Stack>
  );
}

function MetaItem({ label, value }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Box sx={{ p: 1.4, minHeight: 68, borderBottom: { xs: '1px solid', md: 0 }, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" fontWeight={780}>{label}</Typography>
        <Box sx={{ mt: 0.45 }}>
          {typeof value === 'string' ? <Typography variant="body2" fontWeight={820} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography> : value}
        </Box>
      </Box>
    </Grid>
  );
}

function TextBlock({ label, value }) {
  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.55, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  );
}

function RoiInformationPanel({ request, canEdit, editing, setEditing, form, setForm, onSubmit }) {
  const roiValues = editing ? form : normalizeRoiFromRequest(request);
  const roi = calculateRoi(roiValues);

  return (
    <WorkspacePanel
      title="ROI Information"
      caption="Business value captured for approval and management reporting"
      action={canEdit && !editing ? <Button size="small" variant="outlined" onClick={() => setEditing(true)}>Edit ROI</Button> : null}
    >
      {editing ? (
        <Stack component="form" spacing={1.5} onSubmit={onSubmit}>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                label="ROI Type"
                value={form.roiType}
                onChange={(event) => setForm((current) => ({ ...current, roiType: event.target.value }))}
                fullWidth
              >
                <MenuItem value="">Not specified</MenuItem>
                <MenuItem value="TIME_SAVINGS">Time Savings</MenuItem>
                <MenuItem value="COST_SAVINGS">Cost Savings</MenuItem>
              </TextField>
            </Grid>
            {form.roiType === 'TIME_SAVINGS' && (
              <>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Hours Saved Per Employee Per Month"
                    type="number"
                    value={form.roiHoursSavedPerEmployeePerMonth}
                    onChange={(event) => setForm((current) => ({ ...current, roiHoursSavedPerEmployeePerMonth: event.target.value }))}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Employees Benefited"
                    type="number"
                    value={form.roiEmployeesBenefited}
                    onChange={(event) => setForm((current) => ({ ...current, roiEmployeesBenefited: event.target.value }))}
                    fullWidth
                  />
                </Grid>
              </>
            )}
            {form.roiType === 'COST_SAVINGS' && (
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Monthly Cost Savings (INR)"
                  type="number"
                  value={form.roiMonthlyCostSavingsInr}
                  onChange={(event) => setForm((current) => ({ ...current, roiMonthlyCostSavingsInr: event.target.value }))}
                  fullWidth
                />
              </Grid>
            )}
          </Grid>
          <Alert severity="info">{roi.annualLabel}</Alert>
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button color="inherit" onClick={() => { setForm(normalizeRoiFromRequest(request)); setEditing(false); }}>Cancel</Button>
            <Button type="submit" variant="contained">Save ROI</Button>
          </Stack>
        </Stack>
      ) : (
        <Grid container spacing={1.25}>
          <RoiMetric label="ROI Type" value={roi.typeLabel} />
          <RoiMetric label="Input Values" value={roi.inputLabel} />
          <RoiMetric label="Monthly ROI" value={roi.monthlyLabel} />
          <RoiMetric label="Calculated Annual ROI" value={roi.annualLabel} emphasis />
        </Grid>
      )}
    </WorkspacePanel>
  );
}

function RoiMetric({ label, value, emphasis = false }) {
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
      <Box sx={{ p: 1.4, borderRadius: 1.75, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => emphasis ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF') : theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
        <Typography variant="body2" fontWeight={emphasis ? 900 : 800} sx={{ mt: 0.35, overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function DevelopmentProgressPanel({ request, progressUpdates }) {
  const progress = Number(request.progress_percentage || request.latest_progress_percentage || 0);
  const latestUpdate = progressUpdates[0];

  return (
    <WorkspacePanel title="Progress" caption="Visible to requester, department head, internal review team, reviewer, assigned team member, and admin">
      <Stack spacing={2}>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            bgcolor: (theme) => theme.custom.semantic.paperSoft,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' } }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={850}>Current Progress</Typography>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', mt: 0.35 }}>
                <Typography variant="h3" sx={{ fontSize: { xs: 36, md: 44 } }}>{progress}%</Typography>
                <Chip
                  size="small"
                  label={getProgressStatusLabel(progress)}
                  color={progress >= 100 ? 'success' : 'primary'}
                  sx={{ borderRadius: 1, fontWeight: 850 }}
                />
              </Stack>
            </Box>
            <Grid container spacing={1.2} sx={{ minWidth: { md: 360 }, width: { xs: '100%', md: 'auto' } }}>
              <ProgressMeta label="Last Updated" value={formatDateTime(request.latest_progress_updated_at || latestUpdate?.created_at)} />
              <ProgressMeta label="Updated By" value={request.latest_progress_updated_by_name || latestUpdate?.developer_name || 'No update yet'} />
            </Grid>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progress}
            color={progressBarColor(progress)}
            sx={{
              mt: 1.75,
              height: 12,
              borderRadius: 999,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.18)' : '#E2E8F0',
              '& .MuiLinearProgress-bar': { borderRadius: 999 },
            }}
          />
          {(request.latest_progress_notes || latestUpdate?.update_notes) && (
            <Typography variant="body2" sx={{ mt: 1.4, whiteSpace: 'pre-wrap', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
              {request.latest_progress_notes || latestUpdate.update_notes}
            </Typography>
          )}
        </Box>

        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={850}>Progress Update History</Typography>
          {progressUpdates.length === 0 ? (
            <EmptyInline message="No development progress updates have been recorded yet." />
          ) : progressUpdates.slice(0, 5).map((update) => (
            <Stack
              key={update.id}
              direction="row"
              spacing={1.25}
              sx={{
                p: 1.25,
                borderRadius: 1.75,
                border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                bgcolor: (theme) => theme.custom.semantic.paper,
              }}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: '#DBEAFE', color: 'primary.main', fontSize: 12, fontWeight: 850 }}>
                {update.developer_name?.[0] || 'D'}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="body2" fontWeight={850}>{update.developer_name}</Typography>
                  <Chip size="small" label={`${update.progress_percentage}% ${getProgressStatusLabel(update.progress_percentage)}`} sx={{ height: 22, borderRadius: 1, fontWeight: 800 }} />
                  <Typography variant="caption" color="text.secondary">{formatDateTime(update.created_at)}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, whiteSpace: 'pre-wrap' }}>{update.update_notes}</Typography>
                {update.attachment_name && (
                  <Typography variant="caption" color="primary.main" fontWeight={800} sx={{ display: 'block', mt: 0.5 }}>
                    Attachment: {update.attachment_name}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </WorkspacePanel>
  );
}

function ProgressMeta({ label, value }) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Box sx={{ p: 1.15, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paper, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <Typography variant="caption" color="text.secondary" fontWeight={820}>{label}</Typography>
        <Typography variant="body2" fontWeight={850}>{value || '-'}</Typography>
      </Box>
    </Grid>
  );
}

function CommentItem({ comment }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 34, height: 34, bgcolor: '#DBEAFE', color: 'primary.main', fontSize: 13, fontWeight: 850 }}>
        {comment.user_name?.[0] || '?'}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0, borderRadius: 1.75, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper, p: 1.4 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={850}>{comment.user_name || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(comment.created_at)}</Typography>
          <StatusBadge value={comment.comment_type} />
        </Stack>
        <Typography variant="body2" sx={{ mt: 0.8, whiteSpace: 'pre-wrap' }}>{comment.comment_text}</Typography>
      </Box>
    </Stack>
  );
}

function AttachmentCard({ attachment, requestId, onPreview }) {
  const token = encodeURIComponent(localStorage.getItem('requestops.accessToken') || '');
  const previewUrl = `${apiBaseUrl}/requests/${requestId}/attachments/${attachment.id}/preview?token=${token}`;
  const downloadUrl = `${apiBaseUrl}/requests/${requestId}/attachments/${attachment.id}/download?token=${token}`;
  const mimeType = attachment.mime_type || '';
  const isImage = mimeType.startsWith('image/');

  return (
    <Box
      sx={{
        p: 1.4,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.paper,
      }}
    >
      <Stack direction="row" spacing={1.2} sx={{ alignItems: 'flex-start' }}>
        {isImage ? (
          <Box
            component="button"
            type="button"
            onClick={() => onPreview(attachment)}
            sx={{
              width: 72,
              height: 54,
              p: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              overflow: 'hidden',
              bgcolor: (theme) => theme.custom.semantic.paperSoft,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Box
              component="img"
              src={previewUrl}
              alt={attachment.original_file_name}
              sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Box>
        ) : (
          <Box sx={{ width: 36, height: 36, borderRadius: 1.4, display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', flexShrink: 0 }}>
            <InsertDriveFileOutlinedIcon fontSize="small" />
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={850} noWrap>{attachment.original_file_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            Uploaded by {attachment.uploaded_by_name || 'Unknown'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.8 }}>
            <Button size="small" href={downloadUrl} target="_blank">Download</Button>
            <Button size="small" color="inherit" onClick={() => onPreview(attachment)}>Preview</Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function AttachmentPreviewDialog({ attachment, requestId, onClose, fullScreen = false }) {
  const token = encodeURIComponent(localStorage.getItem('requestops.accessToken') || '');
  const rawToken = localStorage.getItem('requestops.accessToken') || '';
  const previewUrl = attachment
    ? `${apiBaseUrl}/requests/${requestId}/attachments/${attachment.id}/preview`
    : '';
  const downloadUrl = attachment
    ? `${apiBaseUrl}/requests/${requestId}/attachments/${attachment.id}/download?token=${token}`
    : '';
  const mimeType = attachment?.mime_type || '';
  const canPreview = mimeType.startsWith('image/') || mimeType === 'application/pdf';
  const [objectUrl, setObjectUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let revoked = false;
    let nextObjectUrl = '';

    async function loadPreview() {
      setObjectUrl('');
      setPreviewError('');

      if (!attachment || !canPreview) return;

      setPreviewLoading(true);
      try {
        const response = await fetch(previewUrl, {
          headers: rawToken ? { Authorization: `Bearer ${rawToken}` } : {},
        });
        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}.`);
        }
        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        if (!revoked) setObjectUrl(nextObjectUrl);
      } catch (err) {
        if (!revoked) setPreviewError(err.message || 'Unable to load attachment preview.');
      } finally {
        if (!revoked) setPreviewLoading(false);
      }
    }

    loadPreview();

    return () => {
      revoked = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [attachment, canPreview, previewUrl, rawToken]);

  return (
    <Dialog
      open={Boolean(attachment)}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2.5, height: fullScreen ? '100dvh' : '86vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ py: 1.5, pr: 7 }}>
        <Typography variant="subtitle1" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{attachment?.original_file_name || 'Attachment Preview'}</Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {!attachment ? null : (previewLoading || (canPreview && !objectUrl && !previewError)) ? (
          <Stack spacing={1.5} sx={{ m: 'auto', p: 3, textAlign: 'center', alignItems: 'center' }}>
            <LinearProgress sx={{ width: 220 }} />
            <Typography variant="body2" color="text.secondary">Loading attachment preview...</Typography>
          </Stack>
        ) : previewError ? (
          <Stack spacing={1.5} sx={{ m: 'auto', p: 3, textAlign: 'center', alignItems: 'center' }}>
            <InsertDriveFileOutlinedIcon color="primary" sx={{ fontSize: 44 }} />
            <Typography variant="h6">Unable to load preview</Typography>
            <Typography variant="body2" color="text.secondary">{previewError}</Typography>
            <Button variant="contained" href={downloadUrl} target="_blank">Download File</Button>
          </Stack>
        ) : canPreview ? (
          mimeType.startsWith('image/') ? (
            <Box sx={{ width: '100%', height: '100%', minHeight: { xs: 0, md: 420 }, p: 2, display: 'grid', placeItems: 'center', bgcolor: (theme) => theme.custom.semantic.paperSoft, overflow: 'auto' }}>
              <Box
                component="img"
                src={objectUrl}
                alt={attachment.original_file_name}
                sx={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 1.5 }}
              />
            </Box>
          ) : (
            <Box component="iframe" title={attachment.original_file_name} src={objectUrl} sx={{ width: '100%', height: '100%', minHeight: { xs: 0, md: 520 }, border: 0 }} />
          )
        ) : (
          <Stack spacing={1.5} sx={{ m: 'auto', p: 3, textAlign: 'center', alignItems: 'center' }}>
            <InsertDriveFileOutlinedIcon color="primary" sx={{ fontSize: 44 }} />
            <Typography variant="h6">Preview is not available for this file type</Typography>
            <Typography variant="body2" color="text.secondary">
              Download the file to open it in the correct desktop application.
            </Typography>
            <Button variant="contained" href={downloadUrl} target="_blank">Download File</Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestMoreInformationDialog({ action, form, setForm, onClose, onSubmit, fullScreen = false }) {
  return (
    <Dialog open={Boolean(action)} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2.5 } }}>
      <DialogTitle sx={{ pr: 7 }}>
        <Typography variant="h6">Request Clarification</Typography>
        <Typography variant="body2" color="text.secondary">
          {action?.label || 'Route this request back to the requester for clarification.'}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" spacing={2} onSubmit={onSubmit}>
          <TextField
            select
            label="Reason Category"
            value={form.reasonCategory}
            onChange={(event) => setForm((current) => ({ ...current, reasonCategory: event.target.value }))}
            required
            fullWidth
          >
            {clarificationReasons.map((reason) => (
              <MenuItem key={reason.value} value={reason.value}>{reason.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Note"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            placeholder="Please provide expected business impact and estimated users affected."
            multiline
            minRows={4}
            required
            fullWidth
          />
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button variant="outlined" color="inherit" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained">Request Clarification</Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function ClarificationRequestCard({ clarification, canUpdate, onUpdate }) {
  return (
    <Box
      sx={{
        p: 1.6,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.palette.warning.main}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" color="warning.main" fontWeight={900}>Clarification Requested</Typography>
          <Typography variant="body2" fontWeight={850} sx={{ mt: 0.35 }}>
            Requested by {clarification.requested_by_name || 'Reviewer'}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{formatDateTime(clarification.requested_at)}</Typography>
      </Stack>
      <Grid container spacing={1.25} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>Reason</Typography>
          <Typography variant="body2" fontWeight={800}>{formatClarificationReason(clarification.reason_category)}</Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>Note</Typography>
          <Typography variant="body2">{clarification.note}</Typography>
        </Grid>
      </Grid>
      {canUpdate && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.25, flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" onClick={onUpdate}>Update Request Details</Button>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Add attachments below if supporting files are missing, then respond and resubmit.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

function LatestRequesterUpdate({ clarification }) {
  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.palette.success.main}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(22,163,74,0.12)' : '#F0FDF4',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        p: { xs: 1.6, md: 2 },
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="success.main" fontWeight={900}>
            Most Recent Employee Update
          </Typography>
          <Typography variant="body2" fontWeight={850} sx={{ mt: 0.35 }}>
            {clarification.responded_by_name || 'Requester'} responded to clarification
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Reason: {formatClarificationReason(clarification.reason_category)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(clarification.responded_at)}
        </Typography>
      </Stack>
      <Box
        sx={{
          mt: 1.25,
          p: 1.35,
          borderRadius: 1.5,
          bgcolor: (theme) => theme.custom.semantic.paper,
          border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={800}>Employee response</Typography>
        <Typography variant="body2" sx={{ mt: 0.45, whiteSpace: 'pre-wrap' }}>
          {clarification.response_note}
        </Typography>
      </Box>
    </Box>
  );
}

function UpdateRequestDetailsDialog({ open, form, setForm, onClose, onSubmit, fullScreen = false }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2.5 } }}>
      <DialogTitle sx={{ pr: 7 }}>
        <Typography variant="h6">Update Request Details</Typography>
        <Typography variant="body2" color="text.secondary">
          Update the request information requested by the approver, then respond and resubmit.
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" spacing={2} onSubmit={onSubmit}>
          <TextField
            label="Request Title"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            required
            fullWidth
          />
          <TextField
            label="Business Justification"
            value={form.businessJustification}
            onChange={(event) => setForm((current) => ({ ...current, businessJustification: event.target.value }))}
            multiline
            minRows={3}
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            multiline
            minRows={4}
            required
            fullWidth
          />
          <TextField
            label="Expected Benefits"
            value={form.expectedBenefits}
            onChange={(event) => setForm((current) => ({ ...current, expectedBenefits: event.target.value }))}
            multiline
            minRows={2}
            fullWidth
          />
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button variant="outlined" color="inherit" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained">Save Updates</Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function addPdfSection(doc, title, lines, cursor) {
  let y = cursor;
  const pageHeight = doc.internal.pageSize.getHeight();
  const ensureSpace = (height = 16) => {
    if (y + height > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 18, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  lines.filter(Boolean).forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line), 174);
    ensureSpace(wrapped.length * 5 + 2);
    doc.text(wrapped, 18, y);
    y += wrapped.length * 5 + 2;
  });
  return y + 5;
}

function downloadRequestReportPdf({ request, attachments, timeline, comments, progressUpdates }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const roi = calculateRoi(normalizeRoiFromRequest(request));
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Request Management Report', 18, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${request.request_number} | ${request.title}`, 18, y);
  y += 10;

  y = addPdfSection(doc, 'Request Information', [
    `Requester: ${request.requester_name}`,
    `Department: ${request.department_name}`,
    `Reported To: ${getReportedToName(request)}`,
    `Priority: ${formatEnum(request.priority)}`,
    `Status: ${formatEnum(request.status)}`,
    `Created: ${formatFullDateTime(request.created_at)}`,
  ], y);
  y = addPdfSection(doc, 'Business Context', [
    `Business Justification: ${request.business_justification}`,
    `Description: ${request.description}`,
    `Expected Benefits: ${request.expected_benefits || 'Not provided'}`,
  ], y);
  y = addPdfSection(doc, 'ROI Information', [
    `ROI Type: ${roi.typeLabel}`,
    `Input Values: ${roi.inputLabel}`,
    `Monthly ROI: ${roi.monthlyLabel}`,
    `Calculated Annual ROI: ${roi.annualLabel}`,
  ], y);
  y = addPdfSection(doc, 'Approval Status', [
    `Current Status: ${formatEnum(request.status)}`,
    `Department Head: ${request.department_head_name || getReportedToName(request)}`,
    `IT Head: ${request.it_head_name || 'Not assigned'}`,
    `Assigned Team Member: ${request.active_developer_name || 'Not assigned'}`,
    `Reviewer: ${request.active_qa_name || 'Not assigned'}`,
  ], y);
  y = addPdfSection(doc, 'Scope Definition', [
    request.feasibility_notes ? `Feasibility Notes: ${request.feasibility_notes}` : 'No scope notes available.',
    request.complexity ? `Complexity: ${formatEnum(request.complexity)}` : '',
    request.estimated_effort ? `Estimated Effort: ${request.estimated_effort}` : '',
  ], y);
  y = addPdfSection(doc, 'User Stories', ['No user stories recorded for this request.'], y);
  y = addPdfSection(doc, 'Sprint Information', progressUpdates.length ? progressUpdates.map((item) => `${formatFullDateTime(item.created_at)} - ${item.developer_name}: ${item.progress_percentage}% - ${item.update_notes}`) : ['No sprint or development updates available.'], y);
  y = addPdfSection(doc, 'Attachments', attachments.length ? attachments.map((item) => `${item.original_file_name} (${item.uploaded_by_name}, ${formatFullDateTime(item.uploaded_at)})`) : ['No attachments uploaded.'], y);
  y = addPdfSection(doc, 'Workflow History', timeline.length ? timeline.map((item) => `${formatFullDateTime(item.changed_at)} - ${item.changed_by_name}: ${item.comment || formatEnum(item.to_status)}`) : ['No workflow history recorded.'], y);
  y = addPdfSection(doc, 'Comments', comments.length ? comments.map((item) => `${formatFullDateTime(item.created_at)} - ${item.user_name}: ${item.comment_text}`) : ['No comments recorded.'], y);

  doc.save(`${request.request_number}-report.pdf`);
}

function RequestReportDialog({ open, request, attachments, timeline, comments, progressUpdates, onClose, fullScreen = false }) {
  if (!request) return null;
  const roi = calculateRoi(normalizeRoiFromRequest(request));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
          <Box>
            <Typography variant="h6">Request Management Report</Typography>
            <Typography variant="caption" color="text.secondary">{request.request_number}</Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Stack spacing={2}>
          <ReportSection title="Request Information" rows={[
            ['Title', request.title],
            ['Requester', request.requester_name],
            ['Department', request.department_name],
            ['Reported To', getReportedToName(request)],
            ['Status', formatEnum(request.status)],
            ['Priority', formatEnum(request.priority)],
          ]} />
          <ReportNarrative title="Business Context" items={[
            ['Business Justification', request.business_justification],
            ['Description', request.description],
            ['Expected Benefits', request.expected_benefits || 'Not provided'],
          ]} />
          <ReportSection title="ROI Information" rows={[
            ['ROI Type', roi.typeLabel],
            ['Input Values', roi.inputLabel],
            ['Monthly ROI', roi.monthlyLabel],
            ['Calculated Annual ROI', roi.annualLabel],
          ]} />
          <ReportSection title="Approval Status" rows={[
            ['Department Head', request.department_head_name || getReportedToName(request)],
            ['IT Head', request.it_head_name || 'Not assigned'],
            ['Assigned Team Member', request.active_developer_name || 'Not assigned'],
            ['Reviewer', request.active_qa_name || 'Not assigned'],
          ]} />
          <ReportNarrative title="Scope Definition" items={[
            ['Feasibility Notes', request.feasibility_notes || 'No scope notes available.'],
            ['Complexity', request.complexity ? formatEnum(request.complexity) : 'Not available'],
            ['Estimated Effort', request.estimated_effort || 'Not available'],
          ]} />
          <ReportNarrative title="User Stories" items={[['User Stories', 'No user stories recorded for this request.']]} />
          <ReportNarrative title="Sprint Information" items={progressUpdates.length ? progressUpdates.map((item) => [`${item.progress_percentage}% by ${item.developer_name}`, item.update_notes]) : [['Sprint Information', 'No sprint or development updates available.']]} />
          <ReportList title="Attachments" items={attachments.map((item) => `${item.original_file_name} - ${item.uploaded_by_name} - ${formatFullDateTime(item.uploaded_at)}`)} empty="No attachments uploaded." />
          <ReportList title="Workflow History" items={timeline.map((item) => `${formatFullDateTime(item.changed_at)} - ${item.changed_by_name}: ${item.comment || formatEnum(item.to_status)}`)} empty="No workflow history recorded." />
          <ReportList title="Activity Timeline" items={timeline.map((item) => `${formatFullDateTime(item.changed_at)} - ${formatEnum(item.to_status)}`)} empty="No activity recorded." />
          <ReportList title="Comments" items={comments.map((item) => `${formatFullDateTime(item.created_at)} - ${item.user_name}: ${item.comment_text}`)} empty="No comments recorded." />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button color="inherit" onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => downloadRequestReportPdf({ request, attachments, timeline, comments, progressUpdates })}>
          Download Report
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReportSection({ title, rows }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.elevated, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle1" fontWeight={900}>{title}</Typography>
      <Divider sx={{ my: 1.25 }} />
      <Grid container spacing={1}>
        {rows.map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
            <Typography variant="body2" fontWeight={760} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function ReportNarrative({ title, items }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.elevated, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle1" fontWeight={900}>{title}</Typography>
      <Divider sx={{ my: 1.25 }} />
      <Stack spacing={1.25}>
        {items.map(([label, value]) => (
          <TextBlock key={label} label={label} value={value} />
        ))}
      </Stack>
    </Box>
  );
}

function ReportList({ title, items, empty }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.elevated, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle1" fontWeight={900}>{title}</Typography>
      <Divider sx={{ my: 1.25 }} />
      <Stack spacing={0.8}>
        {(items.length ? items : [empty]).map((item, index) => (
          <Typography key={`${title}-${index}`} variant="body2" sx={{ lineHeight: 1.6, overflowWrap: 'anywhere' }}>{item}</Typography>
        ))}
      </Stack>
    </Box>
  );
}

function RecentActivity({ items, clarifications }) {
  const clarificationActivities = clarifications.map((item) => ({
    id: `clarification-${item.id}`,
    kind: 'clarification',
    title: item.status === 'OPEN' ? 'Clarification Requested' : 'Clarification Resolved',
    actor: item.requested_by_name,
    reason: formatClarificationReason(item.reason_category),
    comment: item.status === 'OPEN' ? item.note : item.response_note,
    date: item.status === 'OPEN' ? item.requested_at : item.responded_at,
  }));
  const statusActivities = items.map((item) => ({
    id: `status-${item.id}`,
    kind: 'status',
    title: item.comment?.includes('Progress Updated') ? 'Progress Updated' : formatEnum(item.to_status),
    actor: item.changed_by_name,
    comment: item.comment,
    date: item.changed_at,
  }));
  const combinedItems = [...clarificationActivities, ...statusActivities]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8);

  return (
    <SidebarPanel title="Recent Activity">
      <Stack spacing={1.35}>
        {combinedItems.length === 0 ? (
          <EmptyInline message="No activity recorded yet." />
        ) : combinedItems.map((item) => (
          <Stack key={item.id} direction="row" spacing={1.1}>
            <Box sx={{ width: 24, height: 24, mt: 0.2, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: (theme) => item.kind === 'clarification' ? theme.palette.warning.light : (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF'), color: item.kind === 'clarification' ? 'warning.main' : 'primary.main', flexShrink: 0 }}>
              <CheckCircleIcon sx={{ fontSize: 14 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={820}>{item.title}</Typography>
              {item.kind === 'clarification' && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', lineHeight: 1.35 }}>Reason: {item.reason}</Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>{item.comment}</Typography>
              <Typography variant="caption" color="text.secondary">{item.actor} · {formatDateTime(item.date)}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </SidebarPanel>
  );
}

function EmptyInline({ message }) {
  return (
    <Box sx={{ p: 2, borderRadius: 1.75, border: (theme) => `1px dashed ${theme.custom.semantic.border}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
      <Typography variant="body2" color="text.secondary">{message}</Typography>
    </Box>
  );
}

function WorkflowActions(props) {
  const {
    request,
    user,
    actionComment,
    setActionComment,
    runAction,
    review,
    setReview,
    assignment,
    setAssignment,
    developers,
    workloadByDeveloper,
    qaUsers,
    progress,
    setProgress,
    testResult,
    setTestResult,
    latestRequesterUpdate,
    clarifications = [],
    attachments = [],
  } = props;
  const role = user?.roleCode;
  const isAdmin = role === 'SYSTEM_ADMIN';
  const canDepartmentApprove = request.status === 'DEPARTMENT_APPROVAL_PENDING' && (role === 'DEPARTMENT_HEAD' || isAdmin);
  const canRespondClarification = request.status === 'CLARIFICATION_REQUESTED' && request.requester_user_id === user?.id;
  const canReviewIt = request.status === 'IT_REVIEW_PENDING' && (role === 'IT_HEAD' || isAdmin);
  const hasActiveAssignment = Boolean(request.active_assignment_id);
  const canAssign = ['ASSIGNMENT_PENDING', 'ASSIGNED'].includes(request.status) && (role === 'IT_HEAD' || role === 'PROJECT_MANAGER' || isAdmin);
  const canStartDevelopment = request.status === 'ASSIGNED' && (role === 'DEVELOPER' || isAdmin);
  const canUpdateDevelopment = request.status === 'IN_DEVELOPMENT' && (role === 'DEVELOPER' || isAdmin);
  const canTest = request.status === 'IN_TESTING' && (role === 'QA' || isAdmin);
  const canUat = request.status === 'UAT_PENDING' && (role === 'UAT_APPROVER' || isAdmin);
  const hasActions = canDepartmentApprove || canRespondClarification || canReviewIt || canAssign || canStartDevelopment || canUpdateDevelopment || canTest || canUat;
  const [selectedActionId, setSelectedActionId] = useState('');
  const [clarificationDetails, setClarificationDetails] = useState({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setSelectedActionId('');
    setActionComment('');
    setClarificationDetails({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
    if (request.active_assignment_id) {
      setAssignment({
        developerUserId: request.active_developer_user_id || '',
        qaUserId: request.active_qa_user_id || '',
        notes: '',
      });
    } else if (request.status === 'ASSIGNMENT_PENDING') {
      setAssignment({ developerUserId: '', qaUserId: '', notes: '' });
    }
    if (request.status === 'IN_DEVELOPMENT') {
      setProgress({
        progressPercentage: Number(request.progress_percentage || 0),
        updateNotes: '',
        attachment: null,
      });
    }
  }, [request.id, request.status, request.progress_percentage, request.active_assignment_id, request.active_developer_user_id, request.active_qa_user_id, setActionComment, setAssignment, setProgress]);

  if (!hasActions && role === 'EMPLOYEE') {
    return null;
  }

  const currentStage = getCurrentWorkflowStep(request.status).label;
  const showLatestResponse = Boolean(latestRequesterUpdate && request.status !== 'CLARIFICATION_REQUESTED');
  const responseAttachments = latestRequesterUpdate
    ? attachments.filter((attachment) => {
      const uploadedAt = new Date(attachment.uploaded_at || 0).getTime();
      const requestedAt = new Date(latestRequesterUpdate.requested_at || 0).getTime();
      const respondedAt = new Date(latestRequesterUpdate.responded_at || Date.now()).getTime();
      return uploadedAt >= requestedAt && uploadedAt <= respondedAt;
    })
    : [];
  const actionGroups = [];
  const selectedDeveloperWorkload = workloadByDeveloper?.get(Number(assignment.developerUserId));

  if (canDepartmentApprove) {
    actionGroups.push(
      {
        id: 'department-approve',
        label: 'Approve',
        description: 'Move request to IT review',
        tone: 'success',
        icon: CheckCircle2,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/department-approval/approve', { comment: actionComment }),
      },
      {
        id: 'department-clarify',
        label: 'Request Details',
        description: 'Return request to requester for clarification',
        tone: 'warning',
        icon: CircleHelp,
        clarification: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/department-approval/request-clarification', clarificationDetails),
      },
      {
        id: 'department-reject',
        label: 'Reject',
        description: 'Stop workflow at department review',
        tone: 'error',
        icon: XCircle,
        requireDecisionNotes: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/department-approval/reject', { comment: actionComment }),
      },
    );
  }

  if (canRespondClarification) {
    actionGroups.push({
      id: 'clarification-respond',
      label: 'Respond and Resubmit',
      description: 'Send updated information back for review',
      tone: 'success',
      icon: Send,
      requireDecisionNotes: true,
      submitLabel: 'Submit Response',
      helper: 'Update request details or add attachments before submitting your clarification response.',
      onSubmit: () => runAction('/clarification/respond', { comment: actionComment }),
    });
  }

  if (canReviewIt) {
    actionGroups.push(
      {
        id: 'it-approve',
        label: 'Approve',
        description: 'Confirm feasibility and prepare team assignment',
        tone: 'success',
        icon: CheckCircle2,
        itReview: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction(
          '/it-review/approve',
          { ...review, comment: actionComment },
          'Internal Review Approved Successfully. Request moved to Waiting For Assignment.',
        ),
      },
      {
        id: 'it-clarify',
        label: 'Request Clarification',
        description: 'Return request to requester for clarification',
        tone: 'warning',
        icon: CircleHelp,
        clarification: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/it-review/request-clarification', clarificationDetails),
      },
      {
        id: 'it-reject',
        label: 'Reject',
        description: 'Reject request after IT review',
        tone: 'error',
        icon: XCircle,
        requireDecisionNotes: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/it-review/reject', { comment: actionComment }),
      },
      {
        id: 'it-defer',
        label: 'Defer',
        description: 'Pause request for future review',
        tone: 'neutral',
        icon: PauseCircle,
        requireDecisionNotes: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/it-review/defer', { comment: actionComment }),
      },
    );
  }

  if (canAssign && !hasActiveAssignment) {
    actionGroups.push({
      id: 'assign-owners',
      label: 'Assign Team',
      description: 'Select assigned team member and reviewer',
      tone: 'success',
      icon: Send,
      assignment: true,
      assignmentMode: 'team',
      submitLabel: 'Submit Assignment',
      onSubmit: () => runAction('/assign', assignment, 'Team Assigned Successfully. Assigned team member and reviewer have been confirmed.'),
    });
  }

  if (canAssign && hasActiveAssignment) {
    actionGroups.push(
      {
        id: 'change-developer',
        label: 'Change Assigned Team Member',
        description: 'Update only the assigned team member',
        tone: 'neutral',
        icon: Send,
        assignment: true,
        assignmentMode: 'developer',
        submitLabel: 'Update Assigned Team Member',
        onSubmit: () => runAction(
          '/assign',
          { ...assignment, qaUserId: assignment.qaUserId || request.active_qa_user_id },
          'Assignment updated successfully. Assigned team member has been changed.',
        ),
      },
      {
        id: 'change-qa',
        label: 'Change Reviewer',
        description: 'Update only the reviewer',
        tone: 'neutral',
        icon: Send,
        assignment: true,
        assignmentMode: 'qa',
        submitLabel: 'Update Reviewer',
        onSubmit: () => runAction(
          '/assign',
          { ...assignment, developerUserId: assignment.developerUserId || request.active_developer_user_id },
          'Assignment updated successfully. Reviewer has been changed.',
        ),
      },
      {
        id: 'reassign-team',
        label: 'Reassign Team',
        description: 'Change assigned team member and reviewer',
        tone: 'success',
        icon: Send,
        assignment: true,
        assignmentMode: 'team',
        submitLabel: 'Submit Reassignment',
        onSubmit: () => runAction('/assign', assignment, 'Assignment updated successfully. Team members have been reassigned.'),
      },
    );
  }

  if (canStartDevelopment) {
    actionGroups.push({
      id: 'start-development',
      label: 'Start Work',
      description: 'Move request into active work',
      tone: 'success',
      icon: PlayCircle,
      submitLabel: 'Submit Decision',
      onSubmit: () => runAction('/development/start'),
    });
  }

  if (canUpdateDevelopment) {
    actionGroups.push(
      {
        id: 'save-progress',
      label: 'Update Progress',
      description: 'Record current progress',
        tone: 'neutral',
        icon: Send,
        progressUpdate: true,
        submitLabel: 'Save Progress',
        onSubmit: () => {
          const payload = new FormData();
          payload.append('progressPercentage', progress.progressPercentage);
          payload.append('updateNotes', progress.updateNotes);
          if (progress.attachment) {
            payload.append('attachment', progress.attachment);
          }
          return runAction('/development/update', payload, `Progress Updated. Request is now ${progress.progressPercentage}% complete.`);
        },
      },
      {
        id: 'complete-development',
        label: 'Mark Ready For Review',
        description: 'Route request to review and validation',
        tone: 'success',
        icon: CheckCircle2,
        requireDecisionNotes: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/development/complete', { comment: actionComment }),
      },
    );
  }

  if (canTest) {
    actionGroups.push(
      {
        id: 'qa-pass',
        label: 'Review Passed',
        description: 'Move request to final approval',
        tone: 'success',
        icon: CheckCircle2,
        testResult: 'PASS',
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/testing/result', { ...testResult, result: 'PASS' }),
      },
      {
        id: 'qa-clarify',
        label: 'Request Clarification',
        description: 'Return request to requester for clarification',
        tone: 'warning',
        icon: CircleHelp,
        clarification: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/testing/request-clarification', clarificationDetails),
      },
      {
        id: 'qa-fail',
        label: 'Return For Changes',
        description: 'Return request for changes',
        tone: 'error',
        icon: XCircle,
        testResult: 'FAIL',
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/testing/result', { ...testResult, result: 'FAIL' }),
      },
    );
  }

  if (canUat) {
    actionGroups.push(
      {
        id: 'uat-approve',
        label: 'Approve',
        description: 'Close request as accepted',
        tone: 'success',
        icon: CheckCircle2,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/uat/approve', { comments: actionComment }),
      },
      {
        id: 'uat-clarify',
        label: 'Request Clarification',
        description: 'Return request to requester for clarification',
        tone: 'warning',
        icon: CircleHelp,
        clarification: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/uat/request-clarification', clarificationDetails),
      },
      {
        id: 'uat-reject',
        label: 'Return For Changes',
        description: 'Return request for changes',
        tone: 'error',
        icon: XCircle,
        requireDecisionNotes: true,
        submitLabel: 'Submit Decision',
        onSubmit: () => runAction('/uat/reject', { comments: actionComment }),
      },
    );
  }

  const selectedAction = actionGroups.find((item) => item.id === selectedActionId);
  const decisionReady = !selectedAction
    ? false
    : selectedAction.clarification
      ? clarificationDetails.note.trim().length >= 5
      : selectedAction.itReview
        ? review.feasibilityNotes.trim().length >= 3 && review.estimatedEffort.trim().length >= 1
        : selectedAction.assignment
          ? selectedAction.assignmentMode === 'developer'
            ? Boolean(assignment.developerUserId && (assignment.qaUserId || request.active_qa_user_id))
            : selectedAction.assignmentMode === 'qa'
              ? Boolean((assignment.developerUserId || request.active_developer_user_id) && assignment.qaUserId)
              : Boolean(assignment.developerUserId && assignment.qaUserId)
          : selectedAction.progressUpdate
            ? progress.updateNotes.trim().length >= 3
            : selectedAction.testResult
              ? testResult.testSummary.trim().length >= 3
              : selectedAction.requireDecisionNotes || selectedAction.id.includes('respond')
                ? actionComment.trim().length >= 3
                : true;

  return (
    <SidebarPanel title="Workflow Actions" emphasized>
      <Stack spacing={1.5}>
        {showLatestResponse && (
          <LatestClarificationResponseCard
            clarification={latestRequesterUpdate}
            attachmentCount={responseAttachments.length}
            historyCount={clarifications.length}
            onViewHistory={() => setHistoryOpen(true)}
          />
        )}

        {hasActiveAssignment && (
          <AssignmentSummaryCard request={request} />
        )}

        <Box
          sx={{
            p: 1.35,
            borderRadius: 1.75,
            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            bgcolor: (theme) => theme.custom.semantic.paperSoft,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={820}>Current Stage</Typography>
          <Typography variant="body2" fontWeight={900}>{currentStage}</Typography>
          <Grid container spacing={1} sx={{ mt: 0.65 }}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">Reported To</Typography>
              <Typography variant="caption" fontWeight={820} sx={{ display: 'block' }}>{getReportedToName(request)}</Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Typography variant="caption" fontWeight={820} sx={{ display: 'block' }}>
                {request.status === 'ASSIGNMENT_PENDING'
                  ? 'Awaiting Assignment'
                  : request.status === 'ASSIGNED'
                    ? 'Team Assigned'
                    : 'Awaiting Decision'}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {!hasActions && role !== 'EMPLOYEE' ? (
          <EmptyInline message="No workflow actions are available for your role at this stage." />
        ) : (
          <Stack spacing={1}>
            {actionGroups.map((action) => (
              <DecisionCard
                key={action.id}
                action={action}
                selected={selectedActionId === action.id}
                onSelect={() => {
                  setSelectedActionId(action.id);
                  if (action.testResult) {
                    setTestResult((current) => ({ ...current, result: action.testResult }));
                  }
                }}
              />
            ))}
          </Stack>
        )}

        {selectedAction && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.75,
              border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
              bgcolor: (theme) => theme.custom.semantic.paper,
            }}
          >
            <Stack spacing={1.35}>
              <Typography variant="subtitle2" fontWeight={900}>{selectedAction.label} Selected</Typography>
              {selectedAction.helper && (
                <Typography variant="caption" color="text.secondary">{selectedAction.helper}</Typography>
              )}

              {selectedAction.itReview && (
                <>
                  <TextField label="Feasibility Notes" value={review.feasibilityNotes} onChange={(e) => setReview({ ...review, feasibilityNotes: e.target.value })} />
                  <TextField label="Complexity" select value={review.complexity} onChange={(e) => setReview({ ...review, complexity: e.target.value })}>
                    {['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                  <TextField label="Estimated Effort" value={review.estimatedEffort} onChange={(e) => setReview({ ...review, estimatedEffort: e.target.value })} />
                  <TextField label="Priority Confirmation" select value={review.priorityConfirmation} onChange={(e) => setReview({ ...review, priorityConfirmation: e.target.value })}>
                    {priorities.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                </>
              )}

              {selectedAction.assignment && (
                <>
                  {(selectedAction.assignmentMode === 'developer' || selectedAction.assignmentMode === 'team') && (
                    <TextField select label="Assigned Team Member" value={assignment.developerUserId} onChange={(e) => setAssignment({ ...assignment, developerUserId: e.target.value })}>
                      {developers.map((developer) => {
                        const workload = workloadByDeveloper?.get(Number(developer.id));
                        const activeCount = workload?.active_request_count ?? 0;
                        const workloadStatus = workloadStatusLabel(workload?.workload_status);
                        return (
                          <MenuItem key={developer.id} value={developer.id}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={750}>{developer.full_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {activeCount} Active Request{activeCount === 1 ? '' : 's'} · {workloadStatus}
                              </Typography>
                            </Box>
                          </MenuItem>
                        );
                      })}
                    </TextField>
                  )}
                  {selectedDeveloperWorkload?.workload_status === 'OVERLOADED' && (
                    <Alert severity="warning">
                      This developer currently has {selectedDeveloperWorkload.active_request_count} active requests assigned and may be overloaded.
                    </Alert>
                  )}
                  {(selectedAction.assignmentMode === 'qa' || selectedAction.assignmentMode === 'team') && (
                    <TextField select label="Reviewer" value={assignment.qaUserId} onChange={(e) => setAssignment({ ...assignment, qaUserId: e.target.value })}>
                      {qaUsers.map((qa) => <MenuItem key={qa.id} value={qa.id}>{qa.full_name}</MenuItem>)}
                    </TextField>
                  )}
                  {selectedAction.assignmentMode === 'team' && (
                    <TextField
                      label="Assignment Notes"
                      value={assignment.notes}
                      onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}
                      placeholder="Add context for the delivery team."
                      multiline
                      minRows={3}
                    />
                  )}
                  {selectedAction.assignmentMode !== 'team' && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedAction.assignmentMode === 'developer'
                        ? `Reviewer remains ${request.active_qa_name || 'assigned reviewer'}.`
                        : `Assigned team member remains ${request.active_developer_name || 'assigned team member'}.`}
                    </Typography>
                  )}
                </>
              )}

              {selectedAction.progressUpdate && (
                <>
                  <TextField
                    type="number"
                    label="Progress Percentage"
                    value={progress.progressPercentage}
                    onChange={(e) => setProgress({ ...progress, progressPercentage: Number(e.target.value) })}
                    slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  />
                  <TextField
                    label="Progress Notes"
                    value={progress.updateNotes}
                    onChange={(e) => setProgress({ ...progress, updateNotes: e.target.value })}
                    placeholder="Main work items completed. Remaining items are in progress."
                    multiline
                    minRows={4}
                  />
                  <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                    {progress.attachment ? progress.attachment.name : 'Attach Progress File'}
                    <input
                      hidden
                      type="file"
                      onChange={(e) => setProgress({ ...progress, attachment: e.target.files?.[0] || null })}
                    />
                  </Button>
                </>
              )}

              {selectedAction.testResult && (
                <>
                  <TextField label="Test Summary" value={testResult.testSummary} onChange={(e) => setTestResult({ ...testResult, testSummary: e.target.value })} />
                  {selectedAction.testResult !== 'PASS' && (
                    <TextField label="Defects Found" value={testResult.defectsFound} onChange={(e) => setTestResult({ ...testResult, defectsFound: e.target.value })} />
                  )}
                </>
              )}

              {selectedAction.clarification ? (
                <>
                  <TextField
                    select
                    label="Reason Category"
                    value={clarificationDetails.reasonCategory}
                    onChange={(e) => setClarificationDetails((current) => ({ ...current, reasonCategory: e.target.value }))}
                    required
                  >
                    {clarificationReasons.map((reason) => <MenuItem key={reason.value} value={reason.value}>{reason.label}</MenuItem>)}
                  </TextField>
                  <TextField
                    label="Clarification Details"
                    value={clarificationDetails.note}
                    onChange={(e) => setClarificationDetails((current) => ({ ...current, note: e.target.value }))}
                    placeholder="Please provide expected business impact and estimated users affected."
                    multiline
                    minRows={4}
                    required
                  />
                </>
              ) : (
                (selectedAction.requireDecisionNotes || selectedAction.id.includes('approve') || selectedAction.id.includes('complete') || selectedAction.id.includes('respond')) && (
                  <TextField
                    label={selectedAction.id === 'clarification-respond' ? 'Response to Clarification' : 'Decision Notes'}
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder={selectedAction.id === 'clarification-respond'
                      ? 'Please explain what changes were made.'
                      : 'Explain your decision or provide additional guidance.'}
                    multiline
                    minRows={3}
                  />
                )
              )}

              <Button variant="contained" onClick={selectedAction.onSubmit} disabled={!decisionReady}>
                {selectedAction.submitLabel || 'Submit Decision'}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
      <ClarificationHistoryDialog open={historyOpen} clarifications={clarifications} onClose={() => setHistoryOpen(false)} />
    </SidebarPanel>
  );
}

function LatestClarificationResponseCard({ clarification, attachmentCount, historyCount, onViewHistory }) {
  return (
    <Box
      sx={{
        p: 1.45,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.palette.primary.main}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EFF6FF',
      }}
    >
      <Stack direction="row" spacing={1.1} sx={{ alignItems: 'flex-start' }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13, fontWeight: 850 }}>
          {(clarification.responded_by_name || 'R')[0]}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="primary.main" fontWeight={900}>Latest Clarification Response</Typography>
              <Typography variant="body2" fontWeight={850}>{clarification.responded_by_name || 'Requester'}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {formatDateTime(clarification.responded_at)}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
            Requested: {formatClarificationReason(clarification.reason_category)}
          </Typography>
          <Box
            sx={{
              mt: 1,
              p: 1.1,
              borderRadius: 1.5,
              bgcolor: (theme) => theme.custom.semantic.paper,
              border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              “{clarification.response_note}”
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {attachmentCount > 0 && (
              <Chip size="small" label={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} added`} sx={{ borderRadius: 1, fontWeight: 750 }} />
            )}
            {historyCount > 1 && (
              <Button size="small" onClick={onViewHistory} sx={{ px: 0.75 }}>View Clarification History</Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function AssignmentSummaryCard({ request }) {
  return (
    <Box
      sx={{
        p: 1.45,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.palette.success.main}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(22,163,74,0.12)' : '#F0FDF4',
      }}
    >
      <Stack direction="row" spacing={1.1} sx={{ alignItems: 'flex-start' }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 1.35,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'success.main',
            color: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={18} strokeWidth={2.4} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="success.main" fontWeight={900}>Team Assigned Successfully</Typography>
          <Typography variant="body2" fontWeight={850} sx={{ mt: 0.25 }}>
            Assigned team member and reviewer have been confirmed for this request.
          </Typography>
          <Grid container spacing={1} sx={{ mt: 1 }}>
            <SummaryValue label="Assigned Team Member" value={request.active_developer_name || 'Not assigned'} />
            <SummaryValue label="Reviewer" value={request.active_qa_name || 'Not assigned'} />
            <SummaryValue label="Assigned By" value={request.active_assignment_assigned_by_name || 'Unknown'} />
            <SummaryValue label="Assigned On" value={formatDateTime(request.active_assignment_assigned_at)} />
          </Grid>
          <Chip
            size="small"
            label="Team Assigned"
            sx={{ mt: 1, borderRadius: 1, fontWeight: 850, color: 'success.main', bgcolor: (theme) => theme.palette.success.light }}
          />
        </Box>
      </Stack>
    </Box>
  );
}

function SummaryValue({ label, value }) {
  return (
    <Grid size={{ xs: 6 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="caption" fontWeight={850} sx={{ display: 'block' }} noWrap>{value}</Typography>
    </Grid>
  );
}

function ClarificationHistoryDialog({ open, clarifications, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('lg'));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2.5 } }}>
      <DialogTitle sx={{ pr: 7 }}>
        <Typography variant="h6">Clarification History</Typography>
        <Typography variant="body2" color="text.secondary">Previous request-info cycles for this request.</Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {clarifications.map((item) => (
            <Box key={item.id} sx={{ p: 1.5, borderRadius: 1.75, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
              <Typography variant="caption" color="warning.main" fontWeight={900}>{formatClarificationReason(item.reason_category)}</Typography>
              <Typography variant="body2" fontWeight={850} sx={{ mt: 0.35 }}>Requested by {item.requested_by_name || 'Reviewer'} · {formatDateTime(item.requested_at)}</Typography>
              <Typography variant="body2" sx={{ mt: 0.75 }}>{item.note}</Typography>
              {item.response_note && (
                <Box sx={{ mt: 1, p: 1.1, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={800}>Requester response</Typography>
                  <Typography variant="body2" sx={{ mt: 0.35 }}>{item.response_note}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.responded_by_name || 'Requester'} · {formatDateTime(item.responded_at)}</Typography>
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function DecisionCard({ action, selected, onSelect }) {
  const Icon = action.icon;
  const toneStyles = {
    success: { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
    warning: { color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' },
    error: { color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
    neutral: { color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
  };
  const tone = toneStyles[action.tone] || toneStyles.neutral;

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      sx={{
        width: '100%',
        textAlign: 'left',
        border: '1px solid',
        borderColor: selected ? tone.border : (theme) => theme.custom.semantic.borderSoft,
        bgcolor: selected ? tone.bg : (theme) => theme.custom.semantic.paper,
        borderRadius: 1.75,
        p: 1.25,
        cursor: 'pointer',
        transition: 'border-color 160ms ease, background-color 160ms ease, transform 160ms ease',
        '&:hover': {
          borderColor: tone.border,
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 1.35,
            display: 'grid',
            placeItems: 'center',
            color: tone.color,
            bgcolor: selected ? '#FFFFFF' : tone.bg,
            border: `1px solid ${tone.border}`,
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={2.3} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={900} color={selected ? tone.color : 'text.primary'}>
            {action.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>
            {action.description}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
