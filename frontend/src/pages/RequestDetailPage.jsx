import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PercentRoundedIcon from '@mui/icons-material/PercentRounded';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { CheckCircle2, CircleHelp, PauseCircle, PlayCircle, Send, XCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import StatusBadge from '../components/StatusBadge';
import { PageSkeleton } from '../components/LoadingState';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { formatEnum, missingReportingAuthorityText, priorities, terminalRequestStatuses } from '../utils/constants';
import { useToast } from '../components/ToastProvider';
import violinLogoUrl from '../../../backend/app/assets/violin-technologies-logo.png';

const workflowSteps = [
  { key: 'SUBMITTED', label: 'Submitted', description: 'Request captured', matches: ['SUBMITTED'] },
  { key: 'DEPARTMENT_APPROVAL_PENDING', label: 'Department Approval', description: 'Business approval review', matches: ['DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED', 'DEPARTMENT_REJECTED'] },
  { key: 'IT_REVIEW_PENDING', label: 'Internal Review', description: 'Feasibility and priority review', matches: ['IT_REVIEW_PENDING', 'IT_REJECTED', 'DEFERRED'] },
  { key: 'ASSIGNMENT_PENDING', label: 'PM Assignment', description: 'Project Manager selection', matches: ['ASSIGNMENT_PENDING', 'PM_ASSIGNED'] },
  { key: 'SCOPE_REVIEW', label: 'Requirements Approval', description: 'PM and Department HOD agreement on requirements', matches: ['SCOPE_REVIEW', 'USER_STORY_REVIEW', 'REQUIREMENTS_DEPARTMENT_REVIEW', 'REQUIREMENTS_PM_REVIEW', 'REQUIREMENTS_IT_REVIEW', 'REQUIREMENTS_CLARIFICATION_REQUESTED', 'REQUIREMENTS_APPROVED'] },
  { key: 'DEVELOPER_ASSIGNED', label: 'Team Assigned', description: 'Developer and reviewer confirmed', matches: ['ASSIGNED', 'DEVELOPER_ASSIGNED'] },
  { key: 'SPRINT_PLANNING', label: 'Sprint Planning', description: 'Sprint and task breakdown', matches: ['SPRINT_PLANNING', 'SPRINT_CREATED', 'SPRINT_ACTIVE'] },
  { key: 'IN_DEVELOPMENT', label: 'Work In Progress', description: 'Active implementation', matches: ['IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE'] },
  { key: 'QA_PENDING', label: 'Review & Validation', description: 'Quality review and validation', matches: ['QA_PENDING', 'QA_FAILED', 'QA_PASSED', 'IN_TESTING', 'TEST_FAILED'] },
  { key: 'UAT_PENDING', label: 'Requester Testing', description: 'Requester user testing and approval', matches: ['UAT_PENDING', 'UAT_FAILED', 'UAT_APPROVED', 'UAT_REJECTED'] },
  { key: 'DEPLOYMENT_PENDING', label: 'Final Deployment Pending', description: 'Deployment and release', matches: ['DEPLOYMENT_PENDING', 'DEPLOYED'] },
  { key: 'READY_FOR_COMPLETION', label: 'Requester Confirmation', description: 'Requester final completion', matches: ['READY_FOR_COMPLETION'] },
  { key: 'CLOSED', label: 'Completed', description: 'Request completed', matches: ['CLOSED'] },
];

const appBasePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5015/srt/api/v1' : `${appBasePath}/api/v1`);

const businessImpactCategories = [
  { value: 'PRODUCTIVITY_IMPROVEMENT', label: 'Productivity Improvement' },
  { value: 'COST_REDUCTION', label: 'Cost Reduction' },
  { value: 'REVENUE_INCREASE', label: 'Revenue Increase' },
  { value: 'PROCESS_AUTOMATION', label: 'Process Automation' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'QUALITY_IMPROVEMENT', label: 'Quality Improvement' },
  { value: 'CUSTOMER_SATISFACTION', label: 'Customer Satisfaction' },
];

const businessImpactCategoryLabels = businessImpactCategories.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {});

const scopeFormDefaults = {
  scopeTitle: 'Project Scope',
  scopeDescription: '',
  businessObjectives: '',
  inScope: '',
  outOfScope: '',
};

function splitScopeItems(value, { keepEmpty = false } = {}) {
  let source = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          source = parsed;
        }
      } catch {
        source = value;
      }
    }
  }
  const lines = Array.isArray(source)
    ? source.map((item) => String(item ?? '').trim())
    : String(source || '')
      .split(/\r?\n/)
      .map((item) => item.replace(/^[-*+•]\s*/, '').trim());
  return keepEmpty ? lines : lines.filter(Boolean);
}

function formatScopeItems(items) {
  return JSON.stringify(items.map((item) => item.trim()).filter(Boolean));
}

function updateScopeItemValue(value, index, nextItem) {
  const items = splitScopeItems(value, { keepEmpty: true });
  items[index] = nextItem;
  return formatScopeItems(items);
}

function removeScopeItemValue(value, index) {
  const items = splitScopeItems(value, { keepEmpty: true });
  return formatScopeItems(items.filter((_, itemIndex) => itemIndex !== index));
}

function addScopeItemValue(value) {
  return JSON.stringify([...splitScopeItems(value, { keepEmpty: true }), '']);
}

const storyFormDefaults = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  priority: 'MEDIUM',
};

function storyToPackageDraft(story = {}) {
  return {
    id: story.id || null,
    storyKey: story.story_key || story.storyKey || '',
    title: story.title || '',
    description: story.description || '',
    acceptanceCriteria: story.acceptance_criteria || story.acceptanceCriteria || '',
    priority: story.priority || 'MEDIUM',
    delete: false,
    localId: story.id ? `story-${story.id}` : `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

function normalizeDraftValue(value) {
  return String(value ?? '').trim();
}

function cleanStoryPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    acceptanceCriteria: form.acceptanceCriteria.trim(),
    priority: form.priority,
    status: 'DRAFT',
  };
}

function validateStoryPayload(payload) {
  if (payload.title.length < 3) return 'User story title must be at least 3 characters.';
  if (payload.description.length < 10) return 'User story description must be at least 10 characters.';
  if (payload.acceptanceCriteria.length < 5) return 'Acceptance criteria must be at least 5 characters.';
  return '';
}

function formatActionError(err) {
  const fieldErrors = err.details?.fieldErrors;
  if (fieldErrors) {
    const messages = Object.entries(fieldErrors)
      .flatMap(([field, errors]) => errors.map((message) => `${formatEnum(field)}: ${message}`));
    if (messages.length) return messages.join(' ');
  }
  return err.message;
}

const progressVisibleStatuses = new Set([
  'ASSIGNED',
  'DEVELOPER_ASSIGNED',
  'SPRINT_PLANNING',
  'IN_DEVELOPMENT',
  'DEVELOPMENT_COMPLETE',
  'QA_PENDING',
  'QA_FAILED',
  'QA_PASSED',
  'IN_TESTING',
  'TEST_FAILED',
  'UAT_PENDING',
  'UAT_FAILED',
  'UAT_APPROVED',
  'UAT_REJECTED',
  'DEPLOYMENT_PENDING',
  'DEPLOYED',
  'READY_FOR_COMPLETION',
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
  '/it-review/resume': 'Deferred request resumed successfully.',
  '/project-manager/assign': 'Project Manager assigned successfully.',
  '/assign': 'Developer assigned successfully.',
  '/development/start': 'Request moved to Development.',
  '/development/update': 'Development progress updated successfully.',
  '/development/complete': 'Development completed successfully.',
  '/development/submit-for-review': 'Submitted to Project Manager for QA review.',
  '/qa/send-to-developer': 'QA changes sent back to the assigned developer.',
  '/testing/result': 'Testing result submitted successfully.',
  '/testing/request-clarification': 'Clarification requested successfully.',
  '/uat/send-to-requester': 'Sent to requester for user testing.',
  '/uat/approve': 'Request approved successfully.',
  '/uat/reject': 'Request rejected successfully.',
  '/uat/request-clarification': 'Clarification requested successfully.',
  '/deployment/complete': 'Deployment completed. Requester confirmation is now required.',
  '/requester/complete': 'Request completed successfully.',
  '/close': 'Request closed successfully.',
  '/withdraw': 'Request withdrawn successfully.',
};

const notificationActionPaths = new Set([
  '/department-approval/approve',
  '/department-approval/reject',
  '/department-approval/request-clarification',
  '/clarification/respond',
  '/it-review/approve',
  '/it-review/reject',
  '/it-review/request-clarification',
  '/it-review/defer',
  '/it-review/resume',
  '/project-manager/assign',
  '/assign',
  '/development/submit-for-review',
  '/development/update',
  '/development/complete',
  '/qa/send-to-developer',
  '/testing/result',
  '/testing/request-clarification',
  '/uat/send-to-requester',
  '/uat/approve',
  '/uat/reject',
  '/uat/request-clarification',
  '/deployment/complete',
  '/requester/complete',
  '/close',
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

function formatIndianNumber(value, options = {}) {
  const number = Number(value || 0);
  const maximumFractionDigits = Number.isInteger(number) ? 0 : 2;
  return number.toLocaleString('en-IN', {
    maximumFractionDigits,
    ...options,
  });
}

function formatInr(value) {
  return `₹${formatIndianNumber(value)}`;
}

function formatPdfInr(value) {
  return `INR ${formatIndianNumber(value)}`;
}

function formatHours(value) {
  return `${formatIndianNumber(value)} Hours`;
}

function hasDevelopmentVisibility(request) {
  return Boolean(request?.active_assignment_id || progressVisibleStatuses.has(request?.status));
}

function normalizeRoiFromRequest(request) {
  return {
    roiType: request?.roi_type || '',
    roiHoursSavedPerEmployeePerMonth: request?.roi_hours_saved_per_employee_per_month ?? '',
    roiUsersImpacted: request?.roi_users_impacted ?? '',
    roiTimeSavedPerTask: request?.roi_time_saved_per_task ?? '',
    roiTimeSavedUnit: request?.roi_time_saved_unit || 'MINUTES',
    roiOccurrencesPerMonth: request?.roi_occurrences_per_month ?? '',
    roiEmployeesBenefited: request?.roi_employees_benefited ?? '',
    roiEstimatedHourlyCostInr: request?.roi_estimated_hourly_cost_inr ?? '',
    roiEstimatedRevenueImpactInr: request?.roi_estimated_revenue_impact_inr ?? '',
    roiBusinessImpactCategory: request?.roi_business_impact_category || '',
    roiMonthlyCostSavingsInr: request?.roi_monthly_cost_savings_inr ?? '',
  };
}

function calculateRoi(values) {
  const timeSaved = Number(values.roiTimeSavedPerTask || 0);
  const timeSavedHours = values.roiTimeSavedUnit === 'HOURS' ? timeSaved : timeSaved / 60;
  const occurrences = Number(values.roiOccurrencesPerMonth || 0);
  const employees = Number(values.roiEmployeesBenefited || 0);
  const hourlyCost = Number(values.roiEstimatedHourlyCostInr || 0);
  const revenueImpact = Number(values.roiEstimatedRevenueImpactInr || 0);
  const monthlyHours = timeSavedHours * occurrences * employees;
  const annualHours = monthlyHours * 12;
  const annualCostSavings = annualHours * hourlyCost;
  const monthlyCapacity = employees * 160;
  const automationPercentage = monthlyCapacity ? Math.min(100, (monthlyHours / monthlyCapacity) * 100) : 0;
  const estimatedRoi = annualCostSavings + revenueImpact;
  const hasBusinessImpact = Boolean(
    values.roiBusinessImpactCategory ||
    values.roiUsersImpacted ||
    values.roiTimeSavedPerTask ||
    values.roiOccurrencesPerMonth ||
    values.roiEmployeesBenefited ||
    values.roiEstimatedHourlyCostInr ||
    values.roiEstimatedRevenueImpactInr
  );
  if (hasBusinessImpact) {
    return {
      typeLabel: businessImpactCategoryLabels[values.roiBusinessImpactCategory] || 'Business Impact',
      inputLabel: `${Number(values.roiUsersImpacted || 0).toLocaleString('en-IN')} users impacted; ${Number(values.roiEmployeesBenefited || 0).toLocaleString('en-IN')} employees benefited`,
      monthlyLabel: `${monthlyHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} hours/month`,
      annualLabel: `${annualHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} hours/year`,
      costSavingsLabel: formatInr(annualCostSavings),
      automationLabel: `${automationPercentage.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`,
      estimatedRoiLabel: formatInr(estimatedRoi),
      monthlyHours,
      annualHours,
      annualCostSavings,
      automationPercentage,
      estimatedRoi,
    };
  }
  if (values.roiType === 'TIME_SAVINGS') {
    const monthly = Number(values.roiHoursSavedPerEmployeePerMonth || 0) * Number(values.roiEmployeesBenefited || 0);
    return {
      typeLabel: 'Time Savings',
      inputLabel: `${Number(values.roiHoursSavedPerEmployeePerMonth || 0).toLocaleString('en-IN')} hours x ${Number(values.roiEmployeesBenefited || 0).toLocaleString('en-IN')} employees`,
      monthlyLabel: `${monthly.toLocaleString('en-IN')} productive hours/month`,
      annualLabel: `${(monthly * 12).toLocaleString('en-IN')} productive hours/year`,
      costSavingsLabel: 'Not available',
      automationLabel: 'Not available',
      estimatedRoiLabel: 'Not available',
      monthlyHours: monthly,
      annualHours: monthly * 12,
      annualCostSavings: 0,
      automationPercentage: 0,
      estimatedRoi: 0,
    };
  }
  if (values.roiType === 'COST_SAVINGS') {
    const monthly = Number(values.roiMonthlyCostSavingsInr || 0);
    return {
      typeLabel: 'Cost Savings',
      inputLabel: `${formatInr(monthly)} per month`,
      monthlyLabel: `${formatInr(monthly)} monthly savings`,
      annualLabel: `${formatInr(monthly * 12)} annual savings`,
      costSavingsLabel: formatInr(monthly * 12),
      automationLabel: 'Not available',
      estimatedRoiLabel: formatInr(monthly * 12),
      monthlyHours: 0,
      annualHours: 0,
      annualCostSavings: monthly * 12,
      automationPercentage: 0,
      estimatedRoi: monthly * 12,
    };
  }
  return {
    typeLabel: 'Not specified',
    inputLabel: 'No ROI information has been provided.',
    monthlyLabel: 'Not available',
    annualLabel: 'Not available',
      costSavingsLabel: 'Not available',
      automationLabel: 'Not available',
      estimatedRoiLabel: 'Not available',
      monthlyHours: 0,
      annualHours: 0,
      annualCostSavings: 0,
      automationPercentage: 0,
      estimatedRoi: 0,
  };
}

function daysBetween(value) {
  if (!value) return 0;
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}

function getCurrentWorkflowStep(status) {
  if (status === 'WITHDRAWN') {
    return { label: 'Withdrawn', description: 'Request withdrawn by requester' };
  }
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

const timelineActivityTitles = {
  'DEPARTMENT_APPROVAL_PENDING->IT_REVIEW_PENDING': 'Department Approval Completed',
  'CLARIFICATION_REQUESTED->IT_REVIEW_PENDING': 'Resubmitted For Internal Review',
  'CLARIFICATION_REQUESTED->DEPARTMENT_APPROVAL_PENDING': 'Resubmitted For Department Review',
  'SUBMITTED->DEPARTMENT_APPROVAL_PENDING': 'Submitted For Department Review',
  'IT_REVIEW_PENDING->ASSIGNMENT_PENDING': 'Internal Review Completed',
  'IT_REVIEW_PENDING->IT_REJECTED': 'Internal Review Rejected',
  'IT_REVIEW_PENDING->DEFERRED': 'Internal Review Deferred',
  'DEFERRED->IT_REVIEW_PENDING': 'Internal Review Resumed',
  'ASSIGNMENT_PENDING->PM_ASSIGNED': 'Project Manager Assigned',
};

function getTimelineActivityTitle(item) {
  if (item.comment?.includes('Progress Updated')) return 'Progress Updated';
  const transitionKey = `${item.from_status || ''}->${item.to_status || ''}`;
  if (timelineActivityTitles[transitionKey]) return timelineActivityTitles[transitionKey];
  if (item.to_status === 'IT_REVIEW_PENDING') return 'Sent To Internal Review';
  if (item.to_status === 'ASSIGNMENT_PENDING') return 'Awaiting Project Manager Assignment';
  return formatEnum(item.to_status);
}

function getWorkflowStatusCaption(status) {
  if (status === 'IT_REVIEW_PENDING') return 'Feasibility Assessment Required';
  if (status === 'ASSIGNMENT_PENDING') return 'Awaiting Project Manager Assignment';
  if (status === 'ASSIGNED') return 'Team Assigned';
  if (status === 'DEPARTMENT_APPROVAL_PENDING') return 'Awaiting Department Decision';
  if (status === 'CLARIFICATION_REQUESTED') return 'Awaiting Requester Response';
  if (status === 'DEFERRED') return 'Deferred';
  return 'Awaiting Decision';
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

function getPendingWithName(request) {
  return request?.current_assignee_name
    || request?.project_manager_name
    || request?.it_head_name
    || request?.department_head_name
    || request?.reported_to_name
    || missingReportingAuthorityText;
}

function canEditRequestDetails(request, user) {
  if (!request || !user) return false;
  const editableStatuses = new Set(['SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED']);
  return editableStatuses.has(request.status)
    && (Number(request.requester_user_id) === Number(user.id) || user.roleCode === 'SYSTEM_ADMIN');
}

function canEditBusinessContext(request, user) {
  if (!request || !user) return false;
  if (user.roleCode === 'SYSTEM_ADMIN' && ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING'].includes(request.status)) return true;
  return (request.status === 'DEPARTMENT_APPROVAL_PENDING'
    && user.roleCode === 'DEPARTMENT_HEAD'
    && Number(request.reported_to_user_id || request.department_head_user_id) === Number(user.id))
    || (request.status === 'IT_REVIEW_PENDING'
      && user.roleCode === 'IT_HEAD'
      && Number(request.it_head_user_id || request.current_assignee_user_id) === Number(user.id));
}

function canEditRoiInformation(request, user) {
  if (!request || !user || request.status === 'CLOSED') return false;
  return user.roleCode === 'SYSTEM_ADMIN'
    || (user.roleCode === 'DEPARTMENT_HEAD'
      && Number(request.reported_to_user_id || request.department_head_user_id) === Number(user.id))
    || (user.roleCode === 'IT_HEAD'
      && request.status === 'IT_REVIEW_PENDING'
      && Number(request.it_head_user_id || request.current_assignee_user_id) === Number(user.id));
}

export default function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowAction = searchParams.get('workflowAction');
  const { user } = useAuth();
  const { showToast } = useToast();
  const theme = useTheme();
  const isMobileLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const [request, setRequest] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [clarifications, setClarifications] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [planningScopes, setPlanningScopes] = useState([]);
  const [planningStories, setPlanningStories] = useState([]);
  const [requirementsReview, setRequirementsReview] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [sprintTasks, setSprintTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [developerWorkloads, setDeveloperWorkloads] = useState([]);
  const [error, setError] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [review, setReview] = useState({ feasibilityNotes: '', complexity: 'MEDIUM', estimatedEffort: '', priorityConfirmation: 'MEDIUM' });
  const [assignment, setAssignment] = useState({ developerUserId: '', qaUserId: '', notes: '' });
  const [testResult, setTestResult] = useState({ result: 'PASS', testSummary: '', defectsFound: '' });
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [clarificationAction, setClarificationAction] = useState(null);
  const [clarificationForm, setClarificationForm] = useState({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsDialogMode, setDetailsDialogMode] = useState('request');
  const [detailsForm, setDetailsForm] = useState({ title: '', businessJustification: '', description: '', expectedBenefits: '' });
  const [roiEditing, setRoiEditing] = useState(false);
  const [roiForm, setRoiForm] = useState(normalizeRoiFromRequest(null));
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  function clearWorkflowActionParam() {
    if (!searchParams.get('workflowAction')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('workflowAction');
    setSearchParams(next, { replace: true });
  }

  const developers = useMemo(() => users.filter((row) => row.status === 'ACTIVE' && row.role_code === 'DEVELOPER'), [users]);
  const projectManagers = useMemo(() => users.filter((row) => row.status === 'ACTIVE' && row.role_code === 'PROJECT_MANAGER'), [users]);
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
  const isCompletedRequest = ['CLOSED', 'WITHDRAWN'].includes(request?.status);
  const canEditRoi = useMemo(() => {
    return canEditRoiInformation(request, user);
  }, [request, user]);
  const canEditDetails = useMemo(() => canEditRequestDetails(request, user), [request, user]);
  const canEditBusinessContextPanel = useMemo(() => canEditBusinessContext(request, user), [request, user]);

  async function load() {
    const [detail, history, requestClarifications, requestAttachments, requestScopes, requestStories, requestRequirementsReview, requestSprints, requestSprintTasks] = await Promise.all([
      api.get(`/requests/${id}`),
      api.get(`/requests/${id}/timeline`),
      api.get(`/requests/${id}/clarifications`),
      api.get(`/requests/${id}/attachments`),
      api.get(`/requests/${id}/scopes`),
      api.get(`/requests/${id}/user-stories`),
      api.get(`/requests/${id}/requirements-review`).catch(() => null),
      api.get(`/requests/${id}/sprints`).catch(() => []),
      api.get(`/requests/${id}/sprint-tasks`).catch(() => []),
    ]);
    setRequest(detail);
    setTimeline(history);
    setClarifications(requestClarifications);
    setAttachments(requestAttachments);
    setPlanningScopes(requestScopes || []);
    setPlanningStories(requestStories || []);
    setRequirementsReview(requestRequirementsReview);
    setSprints(requestSprints || []);
    setSprintTasks(requestSprintTasks || []);
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

  useEffect(() => {
    if (!workflowAction) return;
    clearWorkflowActionParam();
    window.setTimeout(() => {
      document.getElementById('workflow-actions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }, [workflowAction]);

  async function runAction(path, payload = {}, successMessage = 'Action completed.') {
    setError('');
    try {
      const result = await api.post(`/requests/${id}${path}`, payload);
      showToast(successMessage === 'Action completed.' ? workflowSuccessMessages[path] || successMessage : successMessage);
      if (result?.notificationEmails?.length) {
        window.setTimeout(() => showToast(`Email dispatched to ${result.notificationEmails[0]}`), 650);
      } else if (notificationActionPaths.has(path)) {
        window.setTimeout(() => showToast('Notification email dispatched successfully.'), 650);
      }
      setActionComment('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function openClarificationModal(action) {
    setClarificationAction(action);
    setClarificationForm({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  }

  async function submitClarificationRequest(event) {
    event.preventDefault();
    if (!clarificationAction) return;
    setError('');
    try {
      await api.post(`/requests/${id}${clarificationAction.path}`, clarificationForm);
      showToast('Clarification requested.');
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
    setDetailsDialogMode('request');
    setDetailsDialogOpen(true);
  }

  function openBusinessContextDialog() {
    setDetailsForm({
      title: request.title || '',
      businessJustification: request.business_justification || '',
      description: request.description || '',
      expectedBenefits: request.expected_benefits || '',
    });
    setDetailsDialogMode('businessContext');
    setDetailsDialogOpen(true);
  }

  async function submitDetailsUpdate(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post(`/requests/${id}/details`, detailsForm);
      showToast(detailsDialogMode === 'businessContext' ? 'Business context updated.' : 'Request details updated.');
      setDetailsDialogOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadAttachment(event) {
    if (isCompletedRequest) return;
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
    try {
      await api.post(`/requests/${id}/roi`, {
        roiType: null,
        roiHoursSavedPerEmployeePerMonth: null,
        roiUsersImpacted: roiForm.roiUsersImpacted === '' ? null : Number(roiForm.roiUsersImpacted),
        roiTimeSavedPerTask: roiForm.roiTimeSavedPerTask === '' ? null : Number(roiForm.roiTimeSavedPerTask),
        roiTimeSavedUnit: roiForm.roiTimeSavedUnit || 'MINUTES',
        roiOccurrencesPerMonth: roiForm.roiOccurrencesPerMonth === '' ? null : Number(roiForm.roiOccurrencesPerMonth),
        roiEmployeesBenefited: roiForm.roiEmployeesBenefited === '' ? null : Number(roiForm.roiEmployeesBenefited),
        roiEstimatedHourlyCostInr: roiForm.roiEstimatedHourlyCostInr === '' ? null : Number(roiForm.roiEstimatedHourlyCostInr),
        roiEstimatedRevenueImpactInr: roiForm.roiEstimatedRevenueImpactInr === '' ? null : Number(roiForm.roiEstimatedRevenueImpactInr),
        roiBusinessImpactCategory: roiForm.roiBusinessImpactCategory || null,
        roiMonthlyCostSavingsInr: null,
      });
      showToast('ROI information updated successfully.');
      setRoiEditing(false);
      await load();
      window.setTimeout(() => showToast('Notification email dispatched successfully.'), 650);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openReport() {
    setReportOpen(true);
    api.post(`/requests/${id}/report/audit`).catch(() => {});
  }

  const canDeleteRequest = user?.roleCode === 'SYSTEM_ADMIN';

  async function submitDeleteRequest() {
    if (deleteReason.trim().length < 3) return;
    setDeleteBusy(true);
    setError('');
    try {
      await api.post(`/requests/${id}/delete`, { comment: deleteReason.trim() });
      showToast('Request deleted successfully.');
      navigate('/requests');
    } catch (err) {
      setError(err.message);
      setDeleteBusy(false);
    }
  }

  if (!request) return <PageSkeleton />;

  return (
    <Page maxWidth={1560}>
      {error && <Alert severity="error">{error}</Alert>}

      <WorkItemHeader
        request={request}
        canEdit={canEditDetails}
        onEdit={openDetailsDialog}
        onViewReport={openReport}
        canDelete={canDeleteRequest}
        onDelete={() => {
          setDeleteReason('');
          setDeleteDialogOpen(true);
        }}
      />

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, lg: 2.5 },
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(340px, 400px)' },
          alignItems: 'flex-start',
        }}
      >
        <Box sx={{ display: { xs: 'contents', lg: 'block' }, gridColumn: { lg: '1 / 2' }, minWidth: 0 }}>
          <Stack spacing={2.5} sx={{ display: { xs: 'contents', lg: 'flex' }, minWidth: 0 }}>
            <Box sx={{ order: { xs: 1 } }}>
              <WorkspacePanel title="Request Information">
                <Grid container spacing={0}>
                  <MetaItem label="Requester" value={request.requester_name} />
                  <MetaItem label="Department" value={request.department_name} />
                  <MetaItem label="Type" value={formatEnum(request.request_type)} />
                  <MetaItem label="Priority" value={<StatusBadge value={request.priority} />} />
                  <MetaItem label="Pending With" value={getPendingWithName(request)} />
                  <MetaItem label="Created" value={formatDate(request.created_at)} />
                  <MetaItem label="Updated" value={formatDate(request.updated_at)} />
                  <MetaItem label="Full ID" value={request.request_number} />
                </Grid>
              </WorkspacePanel>
            </Box>

            <Box sx={{ order: { xs: 2 } }}>
              <WorkspacePanel
                title="Business Context"
                action={canEditBusinessContextPanel && (
                  <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={openBusinessContextDialog}>
                    Edit Business Context
                  </Button>
                )}
              >
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

            <Box sx={{ order: { xs: 3 } }}>
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

            <Box sx={{ order: { xs: 4 } }}>
              <WorkspacePanel
                title="Attachments"
                caption={`${attachments.length} ${attachments.length === 1 ? 'file' : 'files'}`}
                action={!isCompletedRequest && (
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

            <Box sx={{ order: { xs: 5 } }}>
              <PlanningWorkspace
                request={request}
                user={user}
                scopes={planningScopes}
                stories={planningStories}
                requirementsReview={requirementsReview}
                onRefresh={load}
                showToast={showToast}
                setError={setError}
              />
            </Box>

            <Box sx={{ order: { xs: 6 } }}>
              <DeveloperDeliveryReport
                user={user}
                scope={planningScopes[0] || null}
                stories={planningStories}
                sprints={sprints}
                tasks={sprintTasks}
              />
            </Box>

            <Box sx={{ order: { xs: 7 } }}>
              <SprintPlanningPanel
                request={request}
                user={user}
                sprints={sprints}
                tasks={sprintTasks}
                stories={planningStories}
                developers={developers}
                onRefresh={load}
                showToast={showToast}
                setError={setError}
              />
            </Box>

            {showWorkflowProgress && (
              <Box sx={{ order: { xs: 8 } }}>
                <WorkflowTimeline status={request.status} timeline={timeline} />
              </Box>
            )}

            {showWorkflowProgress && (
              <Box sx={{ order: { xs: 9 } }}>
                <DevelopmentProgressPanel request={request} tasks={sprintTasks} />
              </Box>
            )}
          </Stack>
        </Box>

        <Box sx={{ display: { xs: 'contents', lg: 'block' }, gridColumn: { lg: '2 / 3' }, minWidth: 0, alignSelf: 'flex-start' }}>
          <Stack
            spacing={2}
            sx={{
              display: { xs: 'contents', lg: 'flex' },
              minWidth: 0,
              position: { lg: 'sticky' },
              top: { lg: 82 },
              pr: { lg: 0.25 },
            }}
          >
            <Box sx={{ order: { xs: 5 } }}>
              <CurrentStageCard
                currentStep={currentStep}
                owner={getPendingWithName(request)}
                daysInStage={daysInStage}
                slaStatus={slaStatus}
              />
            </Box>

            <Box
              id="workflow-actions-panel"
              sx={{
                order: { xs: 2, lg: 6 },
                position: { xs: 'sticky', lg: 'static' },
                bottom: { xs: 12, lg: 'auto' },
                zIndex: { xs: 20, lg: 'auto' },
              }}
            >
              <WorkflowActions
                request={request}
                user={user}
                actionComment={actionComment}
                setActionComment={setActionComment}
                setError={setError}
                runAction={runAction}
                review={review}
                setReview={setReview}
                assignment={assignment}
                setAssignment={setAssignment}
                projectManagers={projectManagers}
                developers={developers}
                workloadByDeveloper={workloadByDeveloper}
                qaUsers={qaUsers}
                testResult={testResult}
                setTestResult={setTestResult}
                tasks={sprintTasks}
                openClarificationModal={openClarificationModal}
                latestRequesterUpdate={latestRequesterUpdate}
                clarifications={clarifications}
                attachments={attachments}
                timeline={timeline}
                navigate={navigate}
                showToast={showToast}
              />
            </Box>

            <Box sx={{ order: { xs: 10 } }}>
              <RecentActivity items={recentActivity} clarifications={clarifications} />
            </Box>
          </Stack>
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
        mode={detailsDialogMode}
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
        tasks={sprintTasks}
        generatedBy={user?.fullName || user?.email || 'RequestOps User'}
        onClose={() => setReportOpen(false)}
        fullScreen={isMobileLayout}
      />
      <DeleteRequestDialog
        open={deleteDialogOpen}
        request={request}
        reason={deleteReason}
        setReason={setDeleteReason}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteDialogOpen(false);
            setDeleteReason('');
          }
        }}
        onSubmit={submitDeleteRequest}
        fullScreen={isMobileLayout}
      />
    </Page>
  );
}

function DeleteRequestDialog({ open, request, reason, setReason, busy, onClose, onSubmit, fullScreen = false }) {
  const canSubmit = reason.trim().length >= 3;
  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle>Delete Request</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Alert severity="error">
            This permanently deletes {request?.request_number} and all related workflow data. This action cannot be undone.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Only System Administrators can delete requests. Your action will be recorded in the audit log.
          </Typography>
          <TextField
            label="Reason for deletion"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={3}
            required
            helperText="Minimum 3 characters"
            disabled={busy}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onSubmit} disabled={busy || !canSubmit}>
          Delete Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function WorkItemHeader({ request, canEdit, onEdit, onViewReport, canDelete = false, onDelete }) {
  async function copyRequestNumber() {
    await navigator.clipboard?.writeText(request.request_number);
  }
  const isFinalOutcomeReady = ['READY_FOR_COMPLETION', 'CLOSED'].includes(request.status);

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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignSelf: { xs: 'stretch', lg: 'flex-end' } }}>
            {canEdit && (
              <Button variant="contained" size="small" onClick={onEdit}>
                Edit Request
              </Button>
            )}
            {canDelete && (
              <Button variant="outlined" color="error" size="small" onClick={onDelete}>
                Delete Request
              </Button>
            )}
            <Button variant={isFinalOutcomeReady ? 'contained' : 'outlined'} color={isFinalOutcomeReady ? 'success' : 'primary'} size="small" onClick={onViewReport}>
              {isFinalOutcomeReady ? 'Preview Final ISMS Report' : 'View As Report'}
            </Button>
          </Stack>
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
        <StageMetric label="Pending With" value={owner} />
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
          const completed = index < currentIndex || reachedStatuses.has(step.key);
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
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
              {event.changed_by_name || 'System'}
            </Typography>
            {event.comment && (
              <Box sx={{ mt: 0.55, p: 0.85, borderRadius: 1.25, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
                <Typography variant="caption" color="text.primary" sx={{ display: 'block', lineHeight: 1.35, fontWeight: 760, whiteSpace: 'pre-wrap' }}>
                  {event.comment}
                </Typography>
              </Box>
            )}
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
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <WorkspacePanel
      title="ROI Information"
      caption="Business impact and measurable benefits captured for approval and management reporting"
      action={canEdit && !editing ? <Button size="small" variant="outlined" onClick={() => setEditing(true)}>Edit ROI</Button> : null}
    >
      {editing ? (
        <Stack component="form" spacing={1.5} onSubmit={onSubmit}>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                label="Business Impact Category"
                value={form.roiBusinessImpactCategory}
                onChange={(event) => updateField('roiBusinessImpactCategory', event.target.value)}
                fullWidth
                helperText="Choose the primary business outcome this request supports."
              >
                <MenuItem value="">Select category</MenuItem>
                {businessImpactCategories.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Number of Users Impacted" type="number" value={form.roiUsersImpacted} onChange={(event) => updateField('roiUsersImpacted', event.target.value)} fullWidth helperText="Total business users or customers affected by this improvement." />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Time Saved per Task" type="number" value={form.roiTimeSavedPerTask} onChange={(event) => updateField('roiTimeSavedPerTask', event.target.value)} fullWidth helperText="Estimated time saved each time the process is completed." />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField select label="Unit" value={form.roiTimeSavedUnit} onChange={(event) => updateField('roiTimeSavedUnit', event.target.value)} fullWidth helperText="Minutes or hours">
                <MenuItem value="MINUTES">Minutes</MenuItem>
                <MenuItem value="HOURS">Hours</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="Occurrences per Month" type="number" value={form.roiOccurrencesPerMonth} onChange={(event) => updateField('roiOccurrencesPerMonth', event.target.value)} fullWidth helperText="How often this task/process happens each month." />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="Employees Benefited" type="number" value={form.roiEmployeesBenefited} onChange={(event) => updateField('roiEmployeesBenefited', event.target.value)} fullWidth helperText="Employees whose work time is reduced by this request." />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Estimated Hourly Cost (₹)" type="number" value={form.roiEstimatedHourlyCostInr} onChange={(event) => updateField('roiEstimatedHourlyCostInr', event.target.value)} fullWidth helperText="Average hourly employee cost used to calculate annual savings." />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Estimated Revenue Impact (₹) (Optional)" type="number" value={form.roiEstimatedRevenueImpactInr} onChange={(event) => updateField('roiEstimatedRevenueImpactInr', event.target.value)} fullWidth helperText="Optional expected annual revenue uplift or protected revenue." />
            </Grid>
          </Grid>
          <Box sx={{ p: 1.5, borderRadius: 1.5, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: 'background.paper' }}>
            <Typography variant="subtitle2" fontWeight={820} sx={{ mb: 1 }}>Calculated Business Impact</Typography>
            <Grid container spacing={1.25}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Hours Saved per Month" value={roi.monthlyHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} fullWidth InputProps={{ readOnly: true }} helperText="Time saved per task x occurrences per month x employees benefited." />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Hours Saved per Year" value={roi.annualHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} fullWidth InputProps={{ readOnly: true }} helperText="Hours saved per month x 12." />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Annual Cost Savings" value={roi.costSavingsLabel} fullWidth InputProps={{ readOnly: true }} helperText="Hours saved per year x estimated hourly cost." />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Automation Percentage" value={roi.automationLabel} fullWidth InputProps={{ readOnly: true }} helperText="Monthly hours saved as a share of benefited employees' monthly work capacity." />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Estimated ROI" value={roi.estimatedRoiLabel} fullWidth InputProps={{ readOnly: true }} helperText="Annual cost savings + optional revenue impact." />
              </Grid>
            </Grid>
          </Box>
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button color="inherit" onClick={() => { setForm(normalizeRoiFromRequest(request)); setEditing(false); }}>Cancel</Button>
            <Button type="submit" variant="contained">Save ROI</Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <RoiSummaryCards roi={roi} values={roiValues} />
          <Alert severity="info" sx={{ py: 0.75 }}>
            Annual cost savings are calculated from yearly saved hours and estimated hourly cost. Estimated ROI adds any optional revenue impact.
          </Alert>
        </Stack>
      )}
    </WorkspacePanel>
  );
}

function RoiSummaryCards({ roi, values }) {
  const usersImpacted = Number(values.roiUsersImpacted || 0);
  const revenueImpact = Number(values.roiEstimatedRevenueImpactInr || 0);
  const cards = [
    { label: 'Users Impacted', value: usersImpacted ? usersImpacted.toLocaleString('en-IN') : 'Not specified', icon: GroupsRoundedIcon, tone: 'blue' },
    { label: 'Hours Saved / Month', value: roi.monthlyLabel, icon: AccessTimeRoundedIcon, tone: 'teal' },
    { label: 'Hours Saved / Year', value: roi.annualLabel, icon: AccessTimeRoundedIcon, tone: 'indigo' },
    { label: 'Annual Cost Savings', value: roi.costSavingsLabel, icon: SavingsOutlinedIcon, tone: 'green' },
    { label: 'Revenue Impact', value: revenueImpact ? `₹${revenueImpact.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Optional', icon: TrendingUpRoundedIcon, tone: 'purple' },
    { label: 'Automation %', value: roi.automationLabel, icon: PercentRoundedIcon, tone: 'amber' },
    { label: 'Business Impact', value: roi.typeLabel, icon: CategoryOutlinedIcon, tone: 'slate' },
    { label: 'Estimated ROI', value: roi.estimatedRoiLabel, icon: TrendingUpRoundedIcon, tone: 'blue', emphasis: true },
  ];

  return (
    <Grid container spacing={1}>
      {cards.map((card) => (
        <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
          <RoiSummaryCard {...card} />
        </Grid>
      ))}
    </Grid>
  );
}

function RoiSummaryCard({ label, value, icon: Icon, tone = 'blue', emphasis = false }) {
  const toneMap = {
    blue: { bg: 'rgba(37, 99, 235, 0.08)', fg: '#2563EB' },
    teal: { bg: 'rgba(15, 118, 110, 0.08)', fg: '#0F766E' },
    indigo: { bg: 'rgba(79, 70, 229, 0.08)', fg: '#4F46E5' },
    green: { bg: 'rgba(22, 163, 74, 0.08)', fg: '#16A34A' },
    purple: { bg: 'rgba(124, 58, 237, 0.08)', fg: '#7C3AED' },
    amber: { bg: 'rgba(217, 119, 6, 0.1)', fg: '#D97706' },
    slate: { bg: 'rgba(100, 116, 139, 0.1)', fg: '#64748B' },
  };
  const colors = toneMap[tone] || toneMap.blue;

  return (
    <Box
      sx={{
        p: 1.15,
        minHeight: 82,
        borderRadius: 1.75,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => emphasis
          ? (theme.palette.mode === 'dark' ? 'rgba(37, 99, 235, 0.13)' : 'rgba(37, 99, 235, 0.06)')
          : theme.custom.semantic.paperSoft,
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.2,
          display: 'grid',
          placeItems: 'center',
          bgcolor: colors.bg,
          color: colors.fg,
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 17 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={emphasis ? 950 : 850} sx={{ mt: 0.35, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

function ScopeReport({ scope }) {
  if (!scope) {
    return <Alert severity="info">No scope definition has been submitted for this request yet.</Alert>;
  }

  const report = {
    title: scope.scope_title || 'Project Scope',
    objectives: scope.business_objectives || '',
    notes: scope.scope_description || '',
    inScope: scope.in_scope || '',
    outOfScope: scope.out_of_scope || '',
  };

  return (
    <Stack spacing={1.25}>
      <Box sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>Scope Title</Typography>
        <Typography variant="h6" fontWeight={950} sx={{ mt: 0.35 }}>{report.title}</Typography>
        <Divider sx={{ my: 1.25 }} />
        <Typography variant="caption" color="text.secondary" fontWeight={850}>Business Objectives</Typography>
        <Typography variant="body2" sx={{ mt: 0.35, color: report.objectives ? 'text.primary' : 'text.secondary', whiteSpace: 'pre-line' }}>
          {report.objectives || 'Not provided'}
        </Typography>
      </Box>

      <Grid container spacing={1.25}>
        <ScopeReportBlock label="Scope Notes" value={report.notes} wide />
        <ScopeReportBlock label="In Scope" value={report.inScope} />
        <ScopeReportBlock label="Out of Scope" value={report.outOfScope} />
      </Grid>
    </Stack>
  );
}

function ScopeReportBlock({ label, value, wide = false }) {
  return (
    <Grid size={wide ? { xs: 12 } : { xs: 12, md: 6 }}>
      <Box sx={{ height: '100%', p: 1.4, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
        <Typography variant="body2" sx={{ mt: 0.55, color: value ? 'text.primary' : 'text.secondary', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
          {value || 'Not provided'}
        </Typography>
      </Box>
    </Grid>
  );
}

function PlanningWorkspace({ request, user, scopes, stories, requirementsReview, preselectedRequirementsAction = '', onRequirementsActionConsumed, onRefresh, showToast, setError }) {
  const [scopeForm, setScopeForm] = useState(scopeFormDefaults);
  const [storyForm, setStoryForm] = useState(storyFormDefaults);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [storyDialog, setStoryDialog] = useState({ open: false, mode: 'create', story: null });
  const [requirementsEditorOpen, setRequirementsEditorOpen] = useState(false);
  const [requirementsEditorTab, setRequirementsEditorTab] = useState('scope');
  const [packageScopeForm, setPackageScopeForm] = useState(scopeFormDefaults);
  const [packageStories, setPackageStories] = useState([]);
  const [packageChangeJustification, setPackageChangeJustification] = useState('');
  const reviewerEditCommentResolverRef = useRef(null);
  const [reviewerEditCommentDialog, setReviewerEditCommentDialog] = useState({ open: false, artifactLabel: '', targetLabel: '', comment: '' });
  const primaryScope = scopes[0] || null;
  const role = user?.roleCode;
  const isAdmin = role === 'SYSTEM_ADMIN';
  const isAssignedPm = isAdmin || (role === 'PROJECT_MANAGER' && Number(request.project_manager_user_id) === Number(user?.id));
  const canManagePlanning = isAssignedPm && ['PM_ASSIGNED', 'REQUIREMENTS_CLARIFICATION_REQUESTED'].includes(request.status);
  const canReviewPlanning = (
    request.status === 'REQUIREMENTS_DEPARTMENT_REVIEW'
      && (isAdmin || (role === 'DEPARTMENT_HEAD' && Number(request.department_head_user_id || request.reported_to_user_id) === Number(user?.id)))
  ) || (
    request.status === 'REQUIREMENTS_PM_REVIEW'
      && isAssignedPm
  );
  const canEditRequirements = canManagePlanning || canReviewPlanning;
  const showSubmittedPlanningPackage = isAssignedPm
    && !canManagePlanning
    && !canReviewPlanning
    && (scopes.length > 0 || stories.length > 0);
  const canShowRequirementReview = Boolean(primaryScope) && stories.length > 0;
  const storyPayload = cleanStoryPayload(storyForm);
  const storyValidationError = validateStoryPayload(storyPayload);
  const packageHasChanges = useMemo(() => {
    const originalScope = primaryScope ? {
      scopeTitle: primaryScope.scope_title || 'Project Scope',
      scopeDescription: primaryScope.scope_description || '',
      businessObjectives: primaryScope.business_objectives || '',
      inScope: primaryScope.in_scope || '',
      outOfScope: primaryScope.out_of_scope || '',
    } : scopeFormDefaults;
    const scopeChanged = ['scopeTitle', 'scopeDescription', 'businessObjectives', 'inScope', 'outOfScope']
      .some((field) => normalizeDraftValue(packageScopeForm[field]) !== normalizeDraftValue(originalScope[field]));
    if (scopeChanged) return true;

    const originalStoriesById = new Map(stories.map((story) => [Number(story.id), story]));
    return packageStories.some((story) => {
      if (story.delete) return Boolean(story.id);
      if (!story.id) return true;
      const original = originalStoriesById.get(Number(story.id));
      if (!original) return true;
      return normalizeDraftValue(story.storyKey) !== normalizeDraftValue(original.story_key)
        || normalizeDraftValue(story.title) !== normalizeDraftValue(original.title)
        || normalizeDraftValue(story.description) !== normalizeDraftValue(original.description)
        || normalizeDraftValue(story.acceptanceCriteria) !== normalizeDraftValue(original.acceptance_criteria)
        || normalizeDraftValue(story.priority) !== normalizeDraftValue(original.priority || 'MEDIUM');
    });
  }, [packageScopeForm, packageStories, primaryScope, stories]);
  const workspaceCards = getProjectWorkspaceCards({
    request,
    hasScope: Boolean(primaryScope),
    hasStories: stories.length > 0,
    canManagePlanning,
    openScopeDialog,
    openStoryDialog: () => openStoryDialog('create'),
  });

  useEffect(() => {
    setScopeForm(primaryScope ? {
      scopeTitle: primaryScope.scope_title || 'Project Scope',
      scopeDescription: primaryScope.scope_description || '',
      businessObjectives: primaryScope.business_objectives || '',
      inScope: primaryScope.in_scope || '',
      outOfScope: primaryScope.out_of_scope || '',
    } : scopeFormDefaults);
  }, [primaryScope?.id, primaryScope?.updated_at]);

  function updateScopeField(field, value) {
    setScopeForm((current) => ({ ...current, [field]: value }));
  }

  function updateStoryField(field, value) {
    setStoryForm((current) => ({ ...current, [field]: value }));
  }

  function buildScopeFormFromScope(scope) {
    return scope ? {
      scopeTitle: scope.scope_title || 'Project Scope',
      scopeDescription: scope.scope_description || '',
      businessObjectives: scope.business_objectives || '',
      inScope: scope.in_scope || '',
      outOfScope: scope.out_of_scope || '',
    } : scopeFormDefaults;
  }

  function openRequirementsEditor() {
    setPackageScopeForm(buildScopeFormFromScope(primaryScope));
    setPackageStories(stories.map(storyToPackageDraft));
    setPackageChangeJustification('');
    setRequirementsEditorTab('scope');
    setRequirementsEditorOpen(true);
  }

  function updatePackageScopeField(field, value) {
    setPackageScopeForm((current) => ({ ...current, [field]: value }));
  }

  function updatePackageStory(localId, field, value) {
    setPackageStories((current) => current.map((story) => (
      story.localId === localId ? { ...story, [field]: value } : story
    )));
  }

  function addPackageStory() {
    setPackageStories((current) => [...current, storyToPackageDraft()]);
  }

  function removePackageStory(localId) {
    setPackageStories((current) => current.map((story) => (
      story.localId === localId
        ? story.id ? { ...story, delete: true } : null
        : story
    )).filter(Boolean));
  }

  function requestReviewerEditComment(artifactLabel) {
    return new Promise((resolve) => {
      reviewerEditCommentResolverRef.current = resolve;
      setReviewerEditCommentDialog({
        open: true,
        artifactLabel,
        targetLabel: request.status === 'REQUIREMENTS_PM_REVIEW' ? 'Department HOD' : 'Project Manager',
        comment: '',
      });
    });
  }

  function updateReviewerEditComment(commentValue) {
    setReviewerEditCommentDialog((current) => ({ ...current, comment: commentValue }));
  }

  function closeReviewerEditCommentDialog() {
    reviewerEditCommentResolverRef.current?.(null);
    reviewerEditCommentResolverRef.current = null;
    setReviewerEditCommentDialog({ open: false, artifactLabel: '', targetLabel: '', comment: '' });
  }

  function submitReviewerEditComment() {
    const commentValue = reviewerEditCommentDialog.comment.trim();
    if (commentValue.length < 3) return;
    reviewerEditCommentResolverRef.current?.(commentValue);
    reviewerEditCommentResolverRef.current = null;
    setReviewerEditCommentDialog({ open: false, artifactLabel: '', targetLabel: '', comment: '' });
  }

  function openScopeDialog() {
    setScopeForm(primaryScope ? {
      scopeTitle: primaryScope.scope_title || 'Project Scope',
      scopeDescription: primaryScope.scope_description || '',
      businessObjectives: primaryScope.business_objectives || '',
      inScope: primaryScope.in_scope || '',
      outOfScope: primaryScope.out_of_scope || '',
    } : scopeFormDefaults);
    setScopeDialogOpen(true);
  }

  function openStoryDialog(mode, story = null) {
    setStoryDialog({ open: true, mode, story });
    setStoryForm(story ? {
      title: story.title || '',
      description: story.description || '',
      acceptanceCriteria: story.acceptance_criteria || '',
      priority: story.priority || 'MEDIUM',
    } : storyFormDefaults);
  }

  function closeStoryDialog() {
    setStoryDialog({ open: false, mode: 'create', story: null });
    setStoryForm(storyFormDefaults);
  }

  async function runPlanningAction(action, message) {
    setError('');
    try {
      await action();
      showToast(message);
      await onRefresh();
    } catch (err) {
      setError(formatActionError(err));
    }
  }

  async function saveScope(overrides = {}) {
    const reviewerComment = canReviewPlanning && Object.keys(overrides).length > 0
      ? await requestReviewerEditComment('Scope')
      : null;
    if (canReviewPlanning && Object.keys(overrides).length > 0 && (!reviewerComment || reviewerComment.trim().length < 3)) {
      setError('Reviewer comment is required when changing scope.');
      return;
    }
    const payload = { ...scopeForm, ...overrides, status: 'DRAFT', reviewerComment };
    await runPlanningAction(
      () => primaryScope
        ? api.put(`/requests/${request.id}/scopes/${primaryScope.id}`, payload)
        : api.post(`/requests/${request.id}/scopes`, payload),
      primaryScope ? 'Scope updated successfully.' : 'Scope draft saved successfully.',
    );
  }

  async function saveScopeFromDialog() {
    await saveScope();
    setScopeDialogOpen(false);
  }

  async function saveStory() {
    const reviewerComment = canReviewPlanning && storyDialog.mode === 'edit'
      ? await requestReviewerEditComment('User Story')
      : null;
    if (canReviewPlanning && storyDialog.mode === 'edit' && (!reviewerComment || reviewerComment.trim().length < 3)) {
      setError('Reviewer comment is required when changing a user story.');
      return;
    }
    const payload = { ...cleanStoryPayload(storyForm), reviewerComment };
    const validationError = validateStoryPayload(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    await runPlanningAction(
      () => storyDialog.mode === 'edit' && storyDialog.story
        ? api.put(`/requests/${request.id}/user-stories/${storyDialog.story.id}`, payload)
        : api.post(`/requests/${request.id}/user-stories`, payload),
      storyDialog.mode === 'edit' ? 'User story updated successfully.' : 'User story added successfully.',
    );
    closeStoryDialog();
  }

  async function deleteStory(story) {
    await runPlanningAction(
      () => api.delete(`/requests/${request.id}/user-stories/${story.id}`),
      'User story deleted successfully.',
    );
    if (storyDialog.story?.id === story.id) closeStoryDialog();
  }

  function validatePackageEditor() {
    if (!packageHasChanges) return 'Edit the scope or at least one user story before sending updated requirements.';
    if (!packageScopeForm.scopeTitle?.trim()) return 'Scope title is required.';
    if (packageChangeJustification.trim().length < 3) return 'Explain Requirement Change is required.';
    const activeStories = packageStories.filter((story) => !story.delete);
    if (activeStories.length === 0) return 'At least one user story is required.';
    const invalidStory = activeStories.find((story) => validateStoryPayload(cleanStoryPayload(story)));
    if (invalidStory) return validateStoryPayload(cleanStoryPayload(invalidStory));
    return '';
  }

  async function submitRequirementsPackageUpdate() {
    const validationError = validatePackageEditor();
    if (validationError) {
      setError(validationError);
      return;
    }
    await runPlanningAction(
      () => api.post(`/requests/${request.id}/requirements-review/update-package`, {
        scope: { ...packageScopeForm, status: 'DRAFT' },
        userStories: packageStories.map((story) => (story.delete ? {
          id: story.id,
          delete: true,
        } : {
          id: story.id,
          storyKey: story.storyKey || null,
          title: story.title,
          description: story.description,
          acceptanceCriteria: story.acceptanceCriteria,
          priority: story.priority,
          delete: false,
        })),
        changeJustification: packageChangeJustification.trim(),
      }),
      'Updated requirements sent for review.',
    );
    setRequirementsEditorOpen(false);
  }

  async function submitPlanning() {
    await runPlanningAction(
      () => api.post(`/requests/${request.id}/planning/submit`),
      'Requirements submitted for Department HOD review.',
    );
  }

  async function runRequirementsReviewAction(path, payload, message) {
    await runPlanningAction(
      () => api.post(`/requests/${request.id}/requirements-review${path}`, payload),
      message,
    );
  }

  if (!canManagePlanning && !canReviewPlanning && !showSubmittedPlanningPackage) {
    return null;
  }

  return (
    <Box
      sx={{
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        overflow: 'hidden',
      }}
    >
      <Stack spacing={0}>
        <PlanningWorkspaceHeader
          request={request}
          requirementsReview={requirementsReview}
        />

        <Box sx={{ p: { xs: 1.5, md: 2.25 } }}>
          <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ alignItems: 'center' }}>
            <ProjectWorkspaceCardGrid cards={workspaceCards} />

            {canReviewPlanning && (
              <Box sx={{ width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" color="warning" startIcon={<EditOutlinedIcon />} onClick={openRequirementsEditor}>
                  Edit Requirements
                </Button>
              </Box>
            )}

            {(primaryScope || stories.length > 0) && (
              <RequirementReport
                request={request}
                scope={primaryScope}
                stories={stories}
                requirementsReview={requirementsReview}
                canManagePlanning={canManagePlanning}
                onEditScope={openScopeDialog}
                openStoryDialog={openStoryDialog}
                deleteStory={deleteStory}
              />
            )}

            {canManagePlanning && canShowRequirementReview && (
              <Box sx={{ width: '100%', maxWidth: 980, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" color="success" onClick={submitPlanning}>
                  {request.status === 'REQUIREMENTS_CLARIFICATION_REQUESTED' ? 'Resubmit Requirements' : 'Submit Review'}
                </Button>
              </Box>
            )}

            {['REQUIREMENTS_DEPARTMENT_REVIEW', 'REQUIREMENTS_PM_REVIEW', 'REQUIREMENTS_IT_REVIEW', 'REQUIREMENTS_CLARIFICATION_REQUESTED'].includes(request.status) && (
              canShowRequirementReview ? (
                <RequirementsReviewPanel
                  request={request}
                  reviewPackage={requirementsReview}
                  canReviewPlanning={canReviewPlanning}
                  preselectedAction={preselectedRequirementsAction}
                  onPreselectedActionConsumed={onRequirementsActionConsumed}
                  onReviewAction={runRequirementsReviewAction}
                />
              ) : (
                <PlanningSection title="Requirement Review">
                  <EmptyInline message="Create the scope and user stories first. Requirement Review appears after both are ready." />
                </PlanningSection>
              )
            )}

          </Stack>
        </Box>

        <StoryEditorDialog
          open={storyDialog.open}
          mode={storyDialog.mode}
          story={storyDialog.story}
          storyForm={storyForm}
          updateStoryField={updateStoryField}
          closeStoryDialog={closeStoryDialog}
          saveStory={saveStory}
          storyValidationError={storyValidationError}
          canEdit={canEditRequirements && storyDialog.mode !== 'view'}
        />
        <ScopeEditorDialog
          open={scopeDialogOpen}
          primaryScope={primaryScope}
          scopeForm={scopeForm}
          updateScopeField={updateScopeField}
          onClose={() => setScopeDialogOpen(false)}
          onSave={saveScopeFromDialog}
        />
        <ReviewerEditCommentDialog
          dialog={reviewerEditCommentDialog}
          onCommentChange={updateReviewerEditComment}
          onClose={closeReviewerEditCommentDialog}
          onSubmit={submitReviewerEditComment}
        />
        <RequirementsPackageEditorDialog
          open={requirementsEditorOpen}
          activeTab={requirementsEditorTab}
          onTabChange={setRequirementsEditorTab}
          scopeForm={packageScopeForm}
          onScopeFieldChange={updatePackageScopeField}
          stories={packageStories}
          onStoryChange={updatePackageStory}
          onAddStory={addPackageStory}
          onRemoveStory={removePackageStory}
          changeJustification={packageChangeJustification}
          onChangeJustification={setPackageChangeJustification}
          hasChanges={packageHasChanges}
          targetLabel={request.status === 'REQUIREMENTS_PM_REVIEW' ? 'Department HOD' : 'Project Manager'}
          onClose={() => setRequirementsEditorOpen(false)}
          onSubmit={submitRequirementsPackageUpdate}
        />
      </Stack>
    </Box>
  );
}

function RequirementReport({ request, scope, stories, requirementsReview, canManagePlanning, onEditScope, openStoryDialog, deleteStory }) {
  const currentRevision = requirementsReview?.currentRevision;
  const revisionHistory = [...(requirementsReview?.revisionHistory || [])].sort((a, b) => Number(a.revision_number || 0) - Number(b.revision_number || 0));
  const currentRevisionNumber = currentRevision?.revision_number || revisionHistory[revisionHistory.length - 1]?.revision_number || '-';
  const approvedStories = stories.filter((story) => story.status === 'APPROVED').length;
  const pendingStories = Math.max(stories.length - approvedStories, 0);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1600,
        mx: 'auto',
        alignSelf: 'stretch',
        borderRadius: { xs: 2.5, md: 4 },
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.78)' : '#FFFFFF',
        boxShadow: (theme) => theme.palette.mode === 'dark'
          ? '0 24px 80px rgba(0,0,0,0.28)'
          : '0 24px 80px rgba(15,23,42,0.08)',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: { xs: 2, md: 3.5, xl: 4.5 },
          py: { xs: 2.25, md: 3.25 },
          borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30,41,59,0.62)' : '#F8FAFC',
        }}
      >
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { lg: 'flex-start' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={950} sx={{ letterSpacing: 1.4 }}>
              Requirements Report
            </Typography>
            <Typography variant="h4" fontWeight={950} sx={{ mt: 0.3, fontSize: { xs: 28, md: 36 } }}>
              {scope?.scope_title || 'Project Requirements'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' }, maxWidth: { lg: 680 } }}>
            <RequirementMetaChip label="Request" value={request.request_number} />
            <RequirementMetaChip label="Revision" value={currentRevisionNumber} />
            <RequirementMetaChip label="Status" value={formatEnum(currentRevision?.status || request.status)} />
          </Stack>
        </Stack>

        {revisionHistory.length > 0 && (
          <RequirementRevisionStrip revisions={revisionHistory} currentRevision={currentRevision} />
        )}
      </Box>

      <Stack spacing={{ xs: 3, md: 4 }} sx={{ p: { xs: 2, md: 3.5, xl: 4.5 } }}>
        <RequirementScopeReport scope={scope} canManagePlanning={canManagePlanning} onEditScope={onEditScope} />
        <RequirementStoriesReport
          stories={stories}
          approvedStories={approvedStories}
          pendingStories={pendingStories}
          canManagePlanning={canManagePlanning}
          openStoryDialog={openStoryDialog}
          deleteStory={deleteStory}
        />
      </Stack>
    </Box>
  );
}

function RequirementMetaChip({ label, value }) {
  return (
    <Box
      sx={{
        px: 1.2,
        py: 0.8,
        borderRadius: 2,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.paper,
        minWidth: 132,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ display: 'block', lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={950} sx={{ mt: 0.45, overflowWrap: 'anywhere' }}>
        {value || '-'}
      </Typography>
    </Box>
  );
}

function RequirementRevisionStrip({ revisions, currentRevision }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ mt: 2, flexWrap: 'wrap' }}>
      {revisions.map((revision) => {
        const isCurrent = Number(revision.revision_number) === Number(currentRevision?.revision_number || revisions[revisions.length - 1]?.revision_number);
        return (
          <Chip
            key={revision.id || revision.revision_number}
            size="small"
            color={isCurrent ? 'primary' : 'default'}
            variant={isCurrent ? 'filled' : 'outlined'}
            label={`Revision ${revision.revision_number}${isCurrent ? ' (Current)' : ''}`}
            sx={{ fontWeight: 850, borderRadius: 1.5 }}
          />
        );
      })}
    </Stack>
  );
}

function RequirementSectionHeading({ kicker, title, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={950} sx={{ letterSpacing: 1.4 }}>
          {kicker}
        </Typography>
        <Typography variant="h5" fontWeight={950} sx={{ mt: 0.35 }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Stack>
  );
}

function RequirementScopeReport({ scope, canManagePlanning, onEditScope }) {
  if (!scope) {
    return (
      <RequirementDocumentSurface>
        <RequirementSectionHeading kicker="Section 1" title="Project Scope" />
        <EmptyInline message="No scope document is available yet." />
      </RequirementDocumentSurface>
    );
  }

  return (
    <RequirementDocumentSurface>
      <Stack spacing={2.4}>
        <RequirementSectionHeading
          kicker="Section 1"
          title="Project Scope"
          action={canManagePlanning && <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onEditScope}>Edit Scope</Button>}
        />
        <Divider />
        <Grid container spacing={{ xs: 1.5, lg: 2.25 }}>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={1.5}>
              <RequirementTextBlock title="Business Objectives" value={scope.business_objectives} emphasized />
              <RequirementTextBlock title="Notes" value={scope.scope_description} />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <RequirementListBlock title="In Scope" items={splitScopeItems(scope.in_scope)} tone="positive" />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <RequirementListBlock title="Out Of Scope" items={splitScopeItems(scope.out_of_scope)} tone="negative" />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Stack>
    </RequirementDocumentSurface>
  );
}

function RequirementDocumentSurface({ children, variant = 'default' }) {
  return (
    <Box
      sx={{
        p: { xs: 2, md: 3, xl: 3.5 },
        borderRadius: { xs: 2.5, md: 3.5 },
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => variant === 'stories'
          ? theme.palette.mode === 'dark' ? 'rgba(2,6,23,0.32)' : '#F8FAFC'
          : theme.custom.semantic.elevated,
      }}
    >
      {children}
    </Box>
  );
}

function RequirementTextBlock({ title, value, emphasized = false }) {
  return (
    <Box
      sx={{
        minHeight: emphasized ? 180 : 140,
        p: { xs: 1.6, md: 2 },
        borderRadius: 2.5,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.paper,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={950} sx={{ letterSpacing: 0.8 }}>
        {title}
      </Typography>
      <Typography variant="body1" sx={{ mt: 1, lineHeight: 1.85, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
        {value || `No ${title.toLowerCase()} added yet.`}
      </Typography>
    </Box>
  );
}

function RequirementListBlock({ title, items, tone }) {
  const icon = tone === 'negative' ? <CloseIcon sx={{ fontSize: 17 }} /> : tone === 'positive' ? <CheckCircleIcon sx={{ fontSize: 17 }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 15 }} />;
  const color = tone === 'negative' ? 'error.main' : tone === 'positive' ? 'success.main' : 'primary.main';

  return (
    <Box
      sx={{
        height: '100%',
        p: { xs: 1.5, md: 1.75 },
        borderRadius: 2.5,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.paper,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.2 }}>
        <Typography variant="subtitle2" fontWeight={950}>{title}</Typography>
        <Chip size="small" label={`${items.length} items`} sx={{ borderRadius: 1.25, fontWeight: 850 }} />
      </Stack>
      <Box sx={{ maxHeight: 360, overflowY: 'auto', pr: 0.5 }}>
        <Grid container spacing={0.9}>
          {items.length ? items.map((item, index) => (
            <Grid key={`${title}-${item}-${index}`} size={{ xs: 12, sm: 6, md: 12, xl: 6 }}>
              <Stack direction="row" spacing={0.9} sx={{ p: 1, borderRadius: 1.75, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.08)' : '#F8FAFC', alignItems: 'flex-start' }}>
                <Box sx={{ color, display: 'grid', placeItems: 'center', width: 22, height: 22, flexShrink: 0 }}>{icon}</Box>
                <Typography variant="body2" sx={{ lineHeight: 1.55, overflowWrap: 'anywhere' }}>{item}</Typography>
              </Stack>
            </Grid>
          )) : (
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary">No {title.toLowerCase()} listed.</Typography>
            </Grid>
          )}
        </Grid>
      </Box>
    </Box>
  );
}

function RequirementStoriesReport({ stories, approvedStories, pendingStories, canManagePlanning, openStoryDialog, deleteStory }) {
  return (
    <RequirementDocumentSurface variant="stories">
      <Stack spacing={2.25}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { lg: 'flex-end' } }}>
          <RequirementSectionHeading
            kicker="Section 2"
            title="User Stories"
            action={canManagePlanning && (
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openStoryDialog('create')}>
                Add User Story
              </Button>
            )}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
            <RequirementMetaChip label="Stories" value={`${stories.length}`} />
            <RequirementMetaChip label="Approved" value={`${approvedStories}`} />
            <RequirementMetaChip label="Pending" value={`${pendingStories}`} />
          </Stack>
        </Stack>
        <Divider />
        {stories.length === 0 ? (
          <EmptyInline message="No user stories created yet." />
        ) : (
          <Stack spacing={1.5}>
            {stories.map((story) => (
              <RequirementStoryCard
                key={story.id}
                story={story}
                canManagePlanning={canManagePlanning}
                openStoryDialog={openStoryDialog}
                deleteStory={deleteStory}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </RequirementDocumentSurface>
  );
}

function RequirementStoryCard({ story, canManagePlanning, openStoryDialog, deleteStory }) {
  const acceptanceItems = splitScopeItems(story.acceptance_criteria);
  return (
    <Box
      sx={{
        p: { xs: 1.75, md: 2.25 },
        borderRadius: 3,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: (theme) => theme.palette.mode === 'dark'
          ? '0 16px 44px rgba(0,0,0,0.22)'
          : '0 16px 44px rgba(15,23,42,0.06)',
      }}
    >
      <Stack spacing={1.75}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={950} sx={{ letterSpacing: 1 }}>
              User Story Document
            </Typography>
            <Typography variant="h6" fontWeight={950} sx={{ fontSize: { xs: 18, md: 20 }, overflowWrap: 'anywhere' }}>
              {story.title}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Chip size="small" label={story.story_key || `US-${story.id}`} sx={{ borderRadius: 1.25, fontWeight: 900 }} />
            <StatusBadge value={story.priority} />
            <StatusBadge value={story.status} />
          </Stack>
        </Stack>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Box sx={{ height: '100%', minHeight: 150, p: 1.5, borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
              <Typography variant="caption" color="text.secondary" fontWeight={950}>Story Description</Typography>
              <Typography variant="body2" sx={{ mt: 0.9, lineHeight: 1.75, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {story.description || 'No story description added.'}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Box sx={{ height: '100%', minHeight: 150, p: 1.5, borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
              <Typography variant="caption" color="text.secondary" fontWeight={950}>Acceptance Criteria</Typography>
              <Stack spacing={0.75} sx={{ mt: 0.9, maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
                {acceptanceItems.length ? acceptanceItems.map((item, index) => (
                  <Stack key={`${story.id}-criteria-${index}`} direction="row" spacing={0.8} sx={{ alignItems: 'flex-start' }}>
                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main', mt: 0.15 }} />
                    <Typography variant="body2" sx={{ lineHeight: 1.55, overflowWrap: 'anywhere' }}>{item}</Typography>
                  </Stack>
                )) : <Typography variant="body2" color="text.secondary">No acceptance criteria added.</Typography>}
              </Stack>
            </Box>
          </Grid>
        </Grid>

        {canManagePlanning && (
          <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => openStoryDialog('edit', story)}>Edit</Button>
            <Button size="small" color="error" onClick={() => deleteStory(story)}>Delete</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function getProjectWorkspaceCards({ request, hasScope, hasStories, canManagePlanning, openScopeDialog, openStoryDialog }) {
  const status = request.status;
  if (['PM_ASSIGNED', 'REQUIREMENTS_CLARIFICATION_REQUESTED'].includes(status)) {
    const cards = [
      {
        title: 'Scope',
        description: 'Define business requirements, objectives, in-scope and out-of-scope items.',
        actionLabel: hasScope ? 'Created' : 'Create Scope',
        onClick: hasScope ? undefined : openScopeDialog,
        enabled: canManagePlanning && !hasScope,
        icon: 'scope',
        completed: hasScope,
      },
      {
        title: 'User Stories',
        description: 'Define backlog, user stories, acceptance criteria and priorities for delivery.',
        actionLabel: hasStories ? 'Add User Story' : 'Create User Stories',
        onClick: openStoryDialog,
        enabled: canManagePlanning,
        icon: 'stories',
        completed: hasStories,
      },
    ];
    return cards;
  }

  if (['REQUIREMENTS_DEPARTMENT_REVIEW', 'REQUIREMENTS_PM_REVIEW', 'REQUIREMENTS_IT_REVIEW', 'REQUIREMENTS_CLARIFICATION_REQUESTED'].includes(status)) {
    return [];
  }

  if (status === 'REQUIREMENTS_APPROVED' || ['SPRINT_PLANNING'].includes(status)) {
    return [
      { title: 'Sprint Board', description: 'Create sprint structure and prepare delivery work.', actionLabel: 'Open Sprint Board', enabled: true, icon: 'sprint' },
      { title: 'Developer Assignment', description: 'Assign developers to sprint tasks.', actionLabel: 'Manage Assignment', enabled: true, icon: 'team' },
    ];
  }

  if (['SPRINT_CREATED', 'SPRINT_ACTIVE', 'IN_DEVELOPMENT'].includes(status)) {
    return [];
  }

  if (status === 'DEVELOPMENT_COMPLETE') {
    return [{ title: 'QA Review', description: 'Submit completed development for QA testing.', actionLabel: 'Submit For QA', enabled: true, icon: 'qa' }];
  }

  if (['QA_PENDING', 'QA_FAILED'].includes(status)) {
    return [{ title: 'QA Review', description: 'Review testing status and QA outcome.', actionLabel: 'Open QA Review', enabled: true, icon: 'qa' }];
  }

  if (status === 'QA_PASSED' || status === 'UAT_PENDING' || status === 'UAT_FAILED') {
    return [{ title: 'UAT Review', description: 'Complete final business validation.', actionLabel: 'Open UAT Review', enabled: true, icon: 'review' }];
  }

  if (['UAT_APPROVED', 'DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION'].includes(status)) {
    return [{ title: 'Deployment', description: 'Track release readiness and deployment closure.', actionLabel: 'Open Deployment', enabled: true, icon: 'deployment' }];
  }

  return [];
}

function ProjectWorkspaceCardGrid({ cards }) {
  if (!cards.length) return null;
  return (
    <Grid container spacing={{ xs: 1.5, md: 2.25 }} sx={{ width: '100%', maxWidth: 920 }}>
      {cards.map((card) => (
        <Grid key={card.title} size={{ xs: 12, md: cards.length === 1 ? 12 : 6, xl: cards.length >= 3 ? 4 : cards.length === 1 ? 12 : 6 }}>
          <ProjectWorkspaceActionCard card={card} />
        </Grid>
      ))}
    </Grid>
  );
}

function ProjectWorkspaceActionCard({ card }) {
  return (
    <Box
      role="button"
      tabIndex={card.enabled ? 0 : -1}
      onClick={card.enabled ? card.onClick : undefined}
      sx={{
        minHeight: { xs: 220, md: 260 },
        height: '100%',
        p: { xs: 2.4, md: 3.2 },
        borderRadius: '28px',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.92)' : '#FFFFFF',
        border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.14)' : 'rgba(226,232,240,0.9)'}`,
        boxShadow: (theme) => theme.palette.mode === 'dark'
          ? '0 24px 70px rgba(0,0,0,0.26)'
          : '0 24px 70px rgba(15,23,42,0.075)',
        cursor: card.enabled ? 'pointer' : 'default',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        '&:hover': card.enabled ? {
          transform: 'translateY(-4px)',
          borderColor: 'primary.main',
          boxShadow: (theme) => theme.palette.mode === 'dark'
            ? '0 30px 90px rgba(0,0,0,0.34)'
            : '0 30px 90px rgba(15,23,42,0.13)',
        } : undefined,
      }}
    >
      <Stack spacing={2.4} sx={{ height: '100%', justifyContent: 'space-between' }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <ProjectWorkspaceIcon type={card.icon} />
            {card.completed && <Chip size="small" color="success" variant="outlined" label="Completed" sx={{ fontWeight: 850 }} />}
          </Stack>
          <Typography variant="h5" fontWeight={950} sx={{ fontSize: { xs: 21, md: 24 } }}>
            {card.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.1, lineHeight: 1.75, maxWidth: 340 }}>
            {card.description}
          </Typography>
        </Box>
        <Typography variant="body2" color={card.enabled ? 'primary.main' : 'text.disabled'} fontWeight={950}>
          {card.actionLabel} →
        </Typography>
      </Stack>
    </Box>
  );
}

function ProjectWorkspaceIcon({ type }) {
  const iconSx = { fontSize: 24 };
  const icon = type === 'stories'
    ? <ContentCopyIcon sx={iconSx} />
    : type === 'review'
      ? <CheckCircleIcon sx={iconSx} />
      : type === 'sprint'
        ? <PlayCircle size={24} />
        : type === 'qa'
          ? <RadioButtonUncheckedIcon sx={iconSx} />
          : <InsertDriveFileOutlinedIcon sx={iconSx} />;
  return (
    <Box
      sx={{
        width: 48,
        height: 48,
        borderRadius: 2.5,
        display: 'grid',
        placeItems: 'center',
        color: 'primary.main',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.16)' : '#EFF6FF',
      }}
    >
      {icon}
    </Box>
  );
}

function ProjectWorkspaceStepper({ tabs, activeTab, onChange }) {
  return (
    <Box sx={{ px: 0.25, py: 0.5 }}>
      <Stack direction="row" spacing={{ xs: 0.75, md: 1 }} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {tabs.map((tab, index) => (
        <Stack
          key={tab.id}
          direction="row"
          spacing={0.7}
          onClick={() => onChange(tab.id)}
          sx={{
            alignItems: 'center',
            opacity: tab.disabled ? 0.45 : 1,
            cursor: tab.disabled ? 'default' : 'pointer',
            pointerEvents: tab.disabled ? 'none' : 'auto',
            px: 0.8,
            py: 0.55,
            borderRadius: 999,
            bgcolor: activeTab === tab.id ? 'rgba(37,99,235,0.10)' : 'transparent',
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: activeTab === tab.id ? 'primary.main' : tab.disabled ? 'transparent' : 'text.secondary',
              border: (theme) => `1.5px solid ${activeTab === tab.id ? theme.palette.primary.main : theme.palette.text.secondary}`,
            }}
          />
          <Typography variant="caption" fontWeight={activeTab === tab.id ? 950 : 820} color={tab.disabled ? 'text.disabled' : 'text.primary'}>
            {tab.label}
          </Typography>
          {index < tabs.length - 1 && (
            <Box sx={{ width: { xs: 0, md: 18 }, height: 1, bgcolor: (theme) => theme.custom.semantic.borderSoft, ml: 0.4, display: { xs: 'none', md: 'block' } }} />
          )}
        </Stack>
      ))}
      </Stack>
    </Box>
  );
}

function RequirementsReviewPanel({ request, reviewPackage, canReviewPlanning, preselectedAction = '', onPreselectedActionConsumed, onReviewAction }) {
  const [comment, setComment] = useState('');
  const [clarificationNote, setClarificationNote] = useState('');
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const preselectedAppliedRef = useRef(false);
  const currentRevision = reviewPackage?.currentRevision;
  const reviews = reviewPackage?.reviews || [];
  const changeLog = reviewPackage?.changeLog || [];
  const revisionHistory = [...(reviewPackage?.revisionHistory || [])].sort((a, b) => Number(a.revision_number || 0) - Number(b.revision_number || 0));
  const timeline = [...(reviewPackage?.timeline || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const selectedRevision = revisionHistory.find((revision) => String(revision.id) === String(selectedRevisionId)) || currentRevision || revisionHistory[revisionHistory.length - 1];
  const departmentReview = reviews.find((item) => item.reviewer_role_code === 'DEPARTMENT_HEAD');
  const pmReview = reviews.find((item) => item.reviewer_role_code === 'PROJECT_MANAGER');
  const pendingRole = currentRevision?.pending_reviewer_role_code;
  const isDepartmentTurn = request.status === 'REQUIREMENTS_DEPARTMENT_REVIEW';
  const isPmTurn = request.status === 'REQUIREMENTS_PM_REVIEW';
  const reviewStatus = request.status === 'REQUIREMENTS_APPROVED' ? 'APPROVED' : currentRevision?.status || 'PENDING';
  const revisionCount = revisionHistory.length;
  const selectedRevisionNumber = Number(selectedRevision?.revision_number || currentRevision?.revision_number || revisionCount || 0);
  const conversationItems = [
    ...reviews.filter((item) => item.comments).map((item) => ({
      id: `review-${item.id}`,
      name: item.reviewer_name || formatEnum(item.reviewer_role_code),
      body: item.comments,
      meta: `${formatEnum(item.decision)} · ${formatDateTime(item.decided_at)}`,
    })),
    ...changeLog.filter((item) => item.change_summary).slice(-4).map((item) => ({
      id: `change-comment-${item.id}`,
      name: item.changed_by_name || 'Reviewer',
      body: item.change_summary,
      meta: formatDateTime(item.created_at),
    })),
  ];
  const changeSummary = buildRequirementChangeSummary(changeLog);

  async function approve() {
    await onReviewAction('/approve', { comment }, 'Requirements approval recorded.');
    setComment('');
  }

  async function requestClarification() {
    if (clarificationNote.trim().length < 3) return;
    await onReviewAction('/request-clarification', { reasonCategory: 'MISSING_REQUIREMENTS', note: clarificationNote }, 'Requirements clarification requested.');
    setClarificationNote('');
    onPreselectedActionConsumed?.();
  }

  useEffect(() => {
    if (!preselectedAction || preselectedAppliedRef.current || !canReviewPlanning) return;
    if (preselectedAction === 'clarification') {
      preselectedAppliedRef.current = true;
      onPreselectedActionConsumed?.();
    }
  }, [preselectedAction, canReviewPlanning, onPreselectedActionConsumed]);

  if (!currentRevision && !['REQUIREMENTS_DEPARTMENT_REVIEW', 'REQUIREMENTS_PM_REVIEW', 'REQUIREMENTS_IT_REVIEW', 'REQUIREMENTS_CLARIFICATION_REQUESTED', 'REQUIREMENTS_APPROVED'].includes(request.status)) {
    return null;
  }

  return (
    <Box id="requirements-review-panel">
      <PlanningSection title="Requirement Review" caption={selectedRevision ? `Revision ${selectedRevisionNumber} of ${revisionCount || selectedRevisionNumber}` : 'No revision submitted yet'}>
      <Stack spacing={1.75}>
        <Box sx={{ p: 1.5, borderRadius: 2.25, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={900}>Requirement Review</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" fontWeight={950}>{selectedRevision ? `Revision ${selectedRevisionNumber} of ${revisionCount || selectedRevisionNumber}` : 'No Revision'}</Typography>
                <StatusBadge value={reviewStatus} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Submitted By: {selectedRevision?.created_by_name || selectedRevision?.submitted_by_name || 'Unknown'} · Pending With: {pendingRole ? formatEnum(pendingRole) : 'Nobody'}
              </Typography>
            </Box>
            {revisionHistory.length > 0 && (
              <TextField
                select
                size="small"
                label="Revision"
                value={selectedRevision?.id || ''}
                onChange={(event) => setSelectedRevisionId(event.target.value)}
                sx={{ minWidth: { xs: '100%', md: 180 } }}
              >
                {revisionHistory.map((revision) => (
                  <MenuItem key={revision.id} value={revision.id}>
                    Revision {revision.revision_number}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </Box>

        <Grid container spacing={1.25}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <RequirementDecisionCard label="Project Manager" value={formatEnum(pmReview?.decision || 'PENDING')} caption={pmReview?.reviewer_name || 'Awaiting decision'} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <RequirementDecisionCard label="Department HOD" value={formatEnum(departmentReview?.decision || 'PENDING')} caption={departmentReview?.reviewer_name || 'Awaiting decision'} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <RequirementDecisionCard label="Current Revision" value={selectedRevision ? `Revision ${selectedRevision.revision_number}` : 'Not submitted'} caption={selectedRevision?.status ? formatEnum(selectedRevision.status) : 'Awaiting PM submission'} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <RequirementDecisionCard label="Review Status" value={formatEnum(reviewStatus)} caption={pendingRole ? `Pending with ${formatEnum(pendingRole)}` : 'No pending reviewer'} />
          </Grid>
        </Grid>

        {canReviewPlanning && (
          <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
            <Stack spacing={1.2}>
              <TextField
                label="Reviewer comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                <Button variant="contained" color="success" onClick={approve}>
                  {isPmTurn ? 'Approve Revision' : isDepartmentTurn ? 'Approve Requirements' : 'Approve Revision'}
                </Button>
              </Stack>
              {isDepartmentTurn && (
                <>
                  <Divider />
                  <TextField
                    label="Clarification note"
                    value={clarificationNote}
                    onChange={(event) => setClarificationNote(event.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                  />
                  <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                    <Button color="warning" variant="outlined" onClick={requestClarification} disabled={clarificationNote.trim().length < 3}>
                      Request Clarification From PM
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          </Box>
        )}

        <Grid container spacing={1.25}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <RequirementTimeline items={timeline} currentRevision={currentRevision} />
          </Grid>
          <Grid size={{ xs: 12, lg: 5 }}>
            <RequirementChangeSummaryCards items={changeSummary} />
          </Grid>
        </Grid>

        <RequirementConversation items={conversationItems} />
      </Stack>
    </PlanningSection>
    </Box>
  );
}

function buildRequirementChangeSummary(changeLog = []) {
  return changeLog
    .filter((item) => item.change_summary || item.field_name)
    .slice(0, 6)
    .map((item) => ({
      label: item.change_summary || `${formatEnum(item.field_name)} updated`,
      caption: [
        item.artifact_type ? formatEnum(item.artifact_type) : 'Requirements',
        item.changed_by_name,
        item.created_at ? formatDateTime(item.created_at) : '',
      ].filter(Boolean).join(' · '),
    }));
}

function RequirementTimeline({ items, currentRevision }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle2" fontWeight={950}>Review Timeline</Typography>
      <Stack spacing={0} sx={{ mt: 1.25 }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No requirement review timeline yet.</Typography>
        ) : items.map((item, index) => {
          const isNewestRevision = Number(item.revision_number) === Number(currentRevision?.revision_number);
          return (
            <Stack key={`timeline-${item.id || index}`} direction="row" spacing={1.25} sx={{ pb: index === items.length - 1 ? 0 : 1.35 }}>
              <Stack sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: isNewestRevision ? 'primary.main' : 'text.disabled', mt: 0.35 }} />
                {index < items.length - 1 && <Box sx={{ width: 2, flex: 1, minHeight: 34, bgcolor: (theme) => theme.custom.semantic.borderSoft, mt: 0.5 }} />}
              </Stack>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={900}>
                  Revision {item.revision_number} · {item.change_summary || formatEnum(item.change_type)}
                </Typography>
                {(item.new_value || item.field_name) && (
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {item.field_name ? `${formatEnum(item.field_name)} changed` : item.new_value}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">{item.changed_by_name || 'System'} · {formatDateTime(item.created_at)}</Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

function RequirementChangeSummaryCards({ items }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle2" fontWeight={950}>Change Summary</Typography>
      <Grid container spacing={1} sx={{ mt: 1 }}>
        {(items.length ? items : [{ label: 'No Changes Recorded', caption: 'This revision has no change summary yet.' }]).map((item) => (
          <Grid key={item.label} size={{ xs: 12, sm: 6, lg: 12 }}>
            <Box sx={{ p: 1.2, borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
              <Typography variant="body2" fontWeight={900}>{item.label}</Typography>
              <Typography variant="caption" color="text.secondary">{item.caption}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function RequirementConversation({ items }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle2" fontWeight={950}>Comments</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No review comments yet.</Typography>
        ) : items.map((item) => (
          <Stack key={item.id} direction="row" spacing={1}>
            <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main', fontWeight: 850 }}>
              {item.name?.[0] || 'R'}
            </Avatar>
            <Box sx={{ minWidth: 0, p: 1.1, borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft, flex: 1 }}>
              <Typography variant="body2" fontWeight={900}>{item.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{item.body}</Typography>
              <Typography variant="caption" color="text.secondary">{item.meta}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function RequirementDecisionCard({ label, value, caption }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
      <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
      <Typography variant="subtitle2" fontWeight={950} sx={{ mt: 0.35 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }}>{caption}</Typography>
    </Box>
  );
}

function RequirementActivityList({ title, items, empty }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="subtitle2" fontWeight={950}>{title}</Typography>
      <Stack spacing={0.8} sx={{ mt: 1 }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{empty}</Typography>
        ) : items.map((item) => (
          <Box key={item.id} sx={{ pb: 0.8, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
            <Typography variant="body2" fontWeight={850}>{item.title}</Typography>
            {item.body && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-line' }}>{item.body}</Typography>}
            <Typography variant="caption" color="text.secondary">{item.meta}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function PlanningWorkspaceHeader({ request, requirementsReview }) {
  const revisionNumber = requirementsReview?.currentRevision?.revision_number;
  const revisionCount = requirementsReview?.revisionHistory?.length || (revisionNumber ? 1 : 0);
  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        py: { xs: 1.35, md: 1.75 },
        borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.72)' : '#F8FAFC',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={950} sx={{ overflowWrap: 'anywhere', lineHeight: 1.25 }}>
            Project Workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
            Request: {request.request_number}
          </Typography>
          {revisionNumber && (
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.8, flexWrap: 'wrap' }}>
              <Chip size="small" label={`Current Revision ${revisionNumber}`} />
              <Chip size="small" variant="outlined" label={`Revision ${revisionNumber} of ${revisionCount}`} />
            </Stack>
          )}
        </Box>
        <Box sx={{ textAlign: { xs: 'left', md: 'right' }, minWidth: { md: 180 } }}>
          <Typography variant="caption" color="text.secondary" fontWeight={850}>PM</Typography>
          <Typography variant="body2" fontWeight={900}>{request.project_manager_name || 'Not assigned'}</Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function ProjectWorkspaceQuickActions({ hasScope, storyCount, onCreateScope, onCreateStory, onViewReviews, canViewReviews }) {
  return (
    <Box sx={{ px: 0.25 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8} sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' } }}>
        {!hasScope && (
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={onCreateScope}>
            Create Scope
          </Button>
        )}
        {storyCount === 0 && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onCreateStory}>
            Create User Story
          </Button>
        )}
        {hasScope && (
          <Button size="small" variant="outlined" onClick={onCreateScope}>
            Open Scope
          </Button>
        )}
        {storyCount > 0 && (
          <Button size="small" variant="outlined" onClick={onCreateStory}>
            Create User Story
          </Button>
        )}
        <Button size="small" variant="outlined" disabled={!canViewReviews} onClick={onViewReviews}>
          View Reviews
        </Button>
        <Button size="small" variant="text" color="inherit" disabled>
          History
        </Button>
      </Stack>
    </Box>
  );
}

function ProjectWorkspaceOverview({ scope, stories, onCreateScope, onOpenScope, onCreateStory, onOpenStories, canManage }) {
  return (
    <Grid container spacing={1.25}>
      <Grid size={{ xs: 12, md: 6 }}>
        <ScopeWorkspaceSummary scope={scope} onCreate={onCreateScope} onOpen={onOpenScope} canManage={canManage} />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <UserStoryWorkspaceSummary stories={stories} onCreate={onCreateStory} onOpen={onOpenStories} canManage={canManage} />
      </Grid>
    </Grid>
  );
}

function ScopeWorkspaceSummary({ scope, onCreate, onOpen, canManage }) {
  if (!scope) {
    return (
      <WorkspaceSummaryCard title="Scope Not Created" action={canManage && <Button size="small" variant="contained" onClick={onCreate}>Create Scope</Button>}>
        <Typography variant="body2" color="text.secondary">Create the project scope to define:</Typography>
        <Stack spacing={0.45} sx={{ mt: 1 }}>
          {['Business Objectives', 'In Scope Items', 'Out Of Scope Items'].map((item) => (
            <Typography key={item} variant="body2" color="text.secondary">• {item}</Typography>
          ))}
        </Stack>
      </WorkspaceSummaryCard>
    );
  }

  const objectiveCount = splitScopeItems(scope.business_objectives).length || (scope.business_objectives ? 1 : 0);
  const inScopeCount = splitScopeItems(scope.in_scope).length;
  return (
    <WorkspaceSummaryCard title="Scope Summary" action={<Button size="small" variant="outlined" onClick={onOpen}>Open Scope</Button>}>
      <Grid container spacing={1}>
        <SummaryMetric label="Business Objectives" value={`${objectiveCount} ${objectiveCount === 1 ? 'Item' : 'Items'}`} />
        <SummaryMetric label="In Scope" value={`${inScopeCount} ${inScopeCount === 1 ? 'Item' : 'Items'}`} />
        <SummaryMetric label="Status" value={<StatusBadge value={scope.status} />} />
      </Grid>
    </WorkspaceSummaryCard>
  );
}

function UserStoryWorkspaceSummary({ stories, onCreate, onOpen, canManage }) {
  if (stories.length === 0) {
    return (
      <WorkspaceSummaryCard title="User Stories Not Created" action={canManage && <Button size="small" variant="contained" onClick={onCreate}>Create User Story</Button>}>
        <Typography variant="body2" color="text.secondary">Create user stories to define the backlog, acceptance criteria, and priority for delivery.</Typography>
      </WorkspaceSummaryCard>
    );
  }

  const approved = stories.filter((story) => story.status === 'APPROVED').length;
  const highPriority = stories.filter((story) => ['HIGH', 'CRITICAL'].includes(story.priority)).length;
  return (
    <WorkspaceSummaryCard title="User Stories Summary" action={<Button size="small" variant="outlined" onClick={onOpen}>Open Stories</Button>}>
      <Grid container spacing={1}>
        <SummaryMetric label="Total Stories" value={stories.length} />
        <SummaryMetric label="Approved" value={approved} />
        <SummaryMetric label="High Priority" value={highPriority} />
        <SummaryMetric label="Status" value={approved === stories.length ? 'Ready' : 'Draft'} />
      </Grid>
    </WorkspaceSummaryCard>
  );
}

function WorkspaceSummaryCard({ title, action, children }) {
  return (
    <Box
      sx={{
        height: '100%',
        p: 1.5,
        borderRadius: 2.5,
        bgcolor: (theme) => theme.custom.semantic.paper,
        boxShadow: (theme) => theme.palette.mode === 'dark' ? '0 18px 44px rgba(0,0,0,0.18)' : '0 18px 44px rgba(15,23,42,0.06)',
      }}
    >
      <Stack spacing={1.2}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={950}>{title}</Typography>
          {action}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <Grid size={{ xs: 6 }}>
      <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
        <Box sx={{ mt: 0.25, '& .MuiChip-root': { height: 22 } }}>
          {typeof value === 'string' || typeof value === 'number' ? (
            <Typography variant="body2" fontWeight={950}>{value}</Typography>
          ) : value}
        </Box>
      </Box>
    </Grid>
  );
}

function ScopeWorkspaceTab({ primaryScope, scopeForm, updateScopeField, saveScope, canEditRequirements }) {
  const [editingSection, setEditingSection] = useState(null);
  const [sectionDrafts, setSectionDrafts] = useState({});
  const documentSections = [
    {
      key: 'businessObjectives',
      label: 'Business Objectives',
      description: 'Clearly define the business outcome this request should deliver.',
      kind: 'text',
      value: scopeForm.businessObjectives,
    },
    {
      key: 'inScope',
      label: 'In Scope',
      description: 'Capabilities, workflows, and deliverables included in this planning package.',
      kind: 'list',
      tone: 'positive',
      value: scopeForm.inScope,
    },
    {
      key: 'outOfScope',
      label: 'Out Of Scope',
      description: 'Items explicitly excluded so delivery boundaries stay clear.',
      kind: 'list',
      tone: 'negative',
      value: scopeForm.outOfScope,
    },
    {
      key: 'scopeDescription',
      label: 'Notes',
      description: 'Additional planning context, constraints, or implementation notes.',
      kind: 'text',
      value: scopeForm.scopeDescription,
    },
  ];

  function startEditing(section) {
    setEditingSection(section.key);
    setSectionDrafts((current) => ({ ...current, [section.key]: section.value || '' }));
  }

  function updateDraft(key, value) {
    setSectionDrafts((current) => ({ ...current, [key]: value }));
  }

  async function saveSection(section) {
    const rawValue = sectionDrafts[section.key] ?? section.value ?? '';
    const nextValue = section.kind === 'list' ? formatScopeItems(splitScopeItems(rawValue)) : rawValue.trim();
    updateScopeField(section.key, nextValue);
    await saveScope({ [section.key]: nextValue });
    setEditingSection(null);
  }

  function startTitleEditing() {
    setEditingSection('scopeTitle');
    setSectionDrafts((current) => ({ ...current, scopeTitle: scopeForm.scopeTitle || 'Project Scope' }));
  }

  async function saveTitle() {
    const nextTitle = (sectionDrafts.scopeTitle || '').trim() || 'Project Scope';
    updateScopeField('scopeTitle', nextTitle);
    await saveScope({ scopeTitle: nextTitle });
    setEditingSection(null);
  }

  return (
    <Stack spacing={2.25}>
      <Box
        sx={{
          px: { xs: 0.5, md: 1 },
          py: 0.5,
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={900} sx={{ letterSpacing: 1.2 }}>
              Requirements Document
            </Typography>
            {editingSection === 'scopeTitle' ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.75, alignItems: { sm: 'center' } }}>
                <TextField
                  size="small"
                  value={sectionDrafts.scopeTitle || ''}
                  onChange={(event) => updateDraft('scopeTitle', event.target.value)}
                  placeholder="Project Scope"
                  sx={{ minWidth: { sm: 360 } }}
                />
                <Stack direction="row" spacing={0.75}>
                  <Button size="small" variant="contained" onClick={saveTitle}>Save Title</Button>
                  <Button size="small" color="inherit" onClick={() => setEditingSection(null)}>Cancel</Button>
                </Stack>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} sx={{ mt: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>
                  {primaryScope?.scope_title || scopeForm.scopeTitle || 'Project Scope'}
                </Typography>
                {canEditRequirements && (
                  <Button size="small" startIcon={<EditOutlinedIcon />} onClick={startTitleEditing}>
                    Edit Title
                  </Button>
                )}
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
            {primaryScope && <StatusBadge value={primaryScope.status} />}
          </Stack>
        </Stack>
      </Box>

      <Stack spacing={1.35}>
        {documentSections.map((section) => (
          <ScopeDocumentSection
            key={section.key}
            section={section}
            draftValue={sectionDrafts[section.key] ?? section.value ?? ''}
            isEditing={editingSection === section.key}
            isCreatingScope={!primaryScope}
            canManagePlanning={canEditRequirements}
            onEdit={() => startEditing(section)}
            onDraftChange={(value) => updateDraft(section.key, value)}
            onCancel={() => setEditingSection(null)}
            onSave={() => saveSection(section)}
          />
        ))}
      </Stack>

      {primaryScope?.review_comments && (
        <Alert severity={primaryScope.status === 'APPROVED' ? 'success' : 'warning'} sx={{ mt: 1.5 }}>
          Department comments: {primaryScope.review_comments}
        </Alert>
      )}
    </Stack>
  );
}

function ScopeDocumentSection({ section, draftValue, isEditing, isCreatingScope, canManagePlanning, onEdit, onDraftChange, onCancel, onSave }) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const content = (
    <ScopeDocumentSectionBody
      section={section}
      draftValue={draftValue}
      isEditing={isEditing}
      isCreatingScope={isCreatingScope}
      canManagePlanning={canManagePlanning}
      onEdit={onEdit}
      onDraftChange={onDraftChange}
      onCancel={onCancel}
      onSave={onSave}
    />
  );

  if (isCompact) {
    return (
      <Accordion
        disableGutters
        elevation={0}
        defaultExpanded={Boolean(section.value) || isEditing}
        sx={{
          borderRadius: '16px !important',
          bgcolor: (theme) => theme.custom.semantic.paper,
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={950}>{section.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {section.kind === 'list' ? `${splitScopeItems(section.value).length} items` : 'Document section'}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {content}
        </AccordionDetails>
      </Accordion>
    );
  }

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2.5,
        bgcolor: (theme) => theme.custom.semantic.paper,
        boxShadow: (theme) => theme.palette.mode === 'dark'
          ? '0 16px 40px rgba(0,0,0,0.22)'
          : '0 16px 40px rgba(15,23,42,0.06)',
      }}
    >
      {content}
    </Box>
  );
}

function ScopeDocumentSectionBody({ section, draftValue, isEditing, isCreatingScope, canManagePlanning, onEdit, onDraftChange, onCancel, onSave }) {
  const showDescription = isCreatingScope || isEditing;

  return (
    <Stack spacing={1.35}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={950}>{section.label}</Typography>
          {showDescription && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.65 }}>
              {section.description}
            </Typography>
          )}
        </Box>
        {canManagePlanning && !isEditing && (
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onEdit}>
            Edit
          </Button>
        )}
      </Stack>

      {isEditing ? (
        <ScopeSectionEditor
          section={section}
          value={draftValue}
          onChange={onDraftChange}
          onCancel={onCancel}
          onSave={onSave}
        />
      ) : (
        <ScopeSectionReadContent section={section} />
      )}
    </Stack>
  );
}

function ScopeSectionReadContent({ section }) {
  if (section.kind === 'list') {
    const items = splitScopeItems(section.value);
    if (items.length === 0) {
      return <EmptyInline message={`No ${section.label.toLowerCase()} items added yet.`} />;
    }

    return (
      <Stack spacing={0.8}>
        {items.map((item, index) => (
          <ScopeListItem key={`${section.key}-${item}-${index}`} item={item} tone={section.tone} />
        ))}
      </Stack>
    );
  }

  return (
    <Typography
      variant="body1"
      sx={{
        color: section.value ? 'text.primary' : 'text.secondary',
        lineHeight: 1.8,
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
      }}
    >
      {section.value || `No ${section.label.toLowerCase()} added yet.`}
    </Typography>
  );
}

function ScopeListItem({ item, tone }) {
  const iconColor = tone === 'positive' ? 'success.main' : tone === 'negative' ? 'error.main' : 'primary.main';
  const Icon = tone === 'negative' ? CloseIcon : tone === 'positive' ? CheckCircleIcon : RadioButtonUncheckedIcon;

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'flex-start',
        px: 1,
        py: 0.9,
        borderRadius: 1.75,
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.08)' : '#F8FAFC',
      }}
    >
      <Box sx={{ display: 'grid', placeItems: 'center', width: 24, height: 24, color: iconColor, flexShrink: 0 }}>
        <Icon sx={{ fontSize: tone === 'negative' ? 18 : 17 }} />
      </Box>
      <Typography variant="body2" sx={{ lineHeight: 1.7, overflowWrap: 'anywhere' }}>
        {item}
      </Typography>
    </Stack>
  );
}

function ScopeSectionEditor({ section, value, onChange, onCancel, onSave }) {
  if (section.kind === 'list') {
    return (
      <Stack spacing={1}>
        <ScopeItemEditor value={value} onChange={onChange} tone={section.tone} />
        <ScopeEditorActions onCancel={onCancel} onSave={onSave} />
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        multiline
        minRows={4}
        fullWidth
        placeholder={`Write ${section.label.toLowerCase()}...`}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            alignItems: 'flex-start',
          },
          '& textarea': { lineHeight: 1.75 },
        }}
      />
      <ScopeEditorActions onCancel={onCancel} onSave={onSave} />
    </Stack>
  );
}

function ScopeItemEditor({ value, onChange, tone }) {
  const items = splitScopeItems(value, { keepEmpty: true });
  const displayItems = items.length > 0 ? items : [''];

  return (
    <Stack spacing={0.75}>
      {displayItems.map((item, index) => (
        <Stack key={`${index}-${displayItems.length}`} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 24, display: 'grid', placeItems: 'center', color: tone === 'negative' ? 'error.main' : tone === 'positive' ? 'success.main' : 'primary.main', flexShrink: 0 }}>
            {tone === 'negative' ? <CloseIcon sx={{ fontSize: 17 }} /> : <AddIcon sx={{ fontSize: 18 }} />}
          </Box>
          <TextField
            size="small"
            value={item}
            onChange={(event) => onChange(updateScopeItemValue(value, index, event.target.value))}
            placeholder="Add item"
            fullWidth
          />
          <IconButton
            size="small"
            color="error"
            onClick={() => onChange(removeScopeItemValue(value, index))}
            disabled={displayItems.length === 1 && !item}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange(addScopeItemValue(value))}>
          Add Item
        </Button>
      </Box>
    </Stack>
  );
}

function ScopeEditorActions({ onCancel, onSave }) {
  return (
    <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
      <Button size="small" color="inherit" onClick={onCancel}>Cancel</Button>
      <Button size="small" variant="contained" onClick={onSave}>Save Section</Button>
    </Stack>
  );
}

function PlanningSection({ title, caption, action, children }) {
  return (
    <Box sx={{ borderRadius: 2.25, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated, overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ px: 1.5, py: 1.15, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={950}>{title}</Typography>
          {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}

function UserStoryBacklog({ stories, canManagePlanning, canEditRequirements, openStoryDialog, deleteStory }) {
  if (stories.length === 0) {
    return <EmptyInline message="No user stories created yet. Add the first backlog item to continue planning." />;
  }

  return (
    <Stack spacing={0.75}>
      <Grid container spacing={0.75} sx={{ px: 1, py: 0.75, display: { xs: 'none', md: 'flex' } }}>
        <Grid size={{ md: 1.5 }}><Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>Story ID</Typography></Grid>
        <Grid size={{ md: 5 }}><Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>Title</Typography></Grid>
        <Grid size={{ md: 1.5 }}><Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>Priority</Typography></Grid>
        <Grid size={{ md: 1.6 }}><Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>Status</Typography></Grid>
        <Grid size={{ md: 2.4 }}><Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>Actions</Typography></Grid>
      </Grid>
      {stories.map((story) => (
        <StoryBacklogRow
          key={story.id}
          story={story}
          canManagePlanning={canManagePlanning}
          canEditRequirements={canEditRequirements}
          openStoryDialog={openStoryDialog}
          deleteStory={deleteStory}
        />
      ))}
    </Stack>
  );
}

function StoryBacklogRow({ story, canManagePlanning, canEditRequirements, openStoryDialog, deleteStory }) {
  const storyId = story.story_key || `US-${String(story.id).padStart(3, '0')}`;

  return (
    <Box sx={{ px: 1, py: 0.9, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Grid container spacing={1} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 1.5 }}>
          <Typography variant="caption" fontWeight={950} color="primary.main">{storyId}</Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="body2" fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{story.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{story.description}</Typography>
        </Grid>
        <Grid size={{ xs: 6, md: 1.5 }}><StatusBadge value={story.priority} /></Grid>
        <Grid size={{ xs: 6, md: 1.6 }}><StatusBadge value={story.status} /></Grid>
        <Grid size={{ xs: 12, md: 2.4 }}>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            {canEditRequirements && <Button size="small" onClick={() => openStoryDialog('edit', story)}>Edit</Button>}
            {canManagePlanning && story.status !== 'APPROVED' && <Button size="small" color="error" onClick={() => deleteStory(story)}>Delete</Button>}
          </Stack>
        </Grid>
      </Grid>
      {story.review_comments && (
        <Alert severity={story.status === 'APPROVED' ? 'success' : 'warning'} sx={{ mt: 1 }}>
          Department comments: {story.review_comments}
        </Alert>
      )}
    </Box>
  );
}

function RequirementsPackageEditorDialog({
  open,
  activeTab,
  onTabChange,
  scopeForm,
  onScopeFieldChange,
  stories,
  onStoryChange,
  onAddStory,
  onRemoveStory,
  changeJustification,
  onChangeJustification,
  hasChanges,
  targetLabel,
  onClose,
  onSubmit,
}) {
  const visibleStories = stories.filter((story) => !story.delete);
  const submitDisabled = changeJustification.trim().length < 3 || !scopeForm.scopeTitle?.trim() || visibleStories.length === 0;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3, minHeight: { md: '82vh' } } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h5" fontWeight={950}>Edit Requirements</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
          Update the complete requirements package from one place.
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Stack sx={{ minHeight: { md: '64vh' } }}>
          <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 2 }}>
            <Alert severity="info">
              This edit creates a new revision and sends the updated requirements to {targetLabel || 'the other reviewer'}. You cannot approve the same revision you modified.
            </Alert>
          </Box>
          <Tabs
            value={activeTab}
            onChange={(_, value) => onTabChange(value)}
            sx={{ px: { xs: 2, md: 2.5 }, mt: 1.5, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}
          >
            <Tab value="scope" label="Scope" />
            <Tab value="stories" label={`User Stories (${visibleStories.length})`} />
          </Tabs>
          <Box sx={{ p: { xs: 2, md: 2.5 }, flex: 1, overflow: 'auto' }}>
            {activeTab === 'scope' ? (
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Scope Title"
                    value={scopeForm.scopeTitle}
                    onChange={(event) => onScopeFieldChange('scopeTitle', event.target.value)}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Business Objectives"
                    value={scopeForm.businessObjectives}
                    onChange={(event) => onScopeFieldChange('businessObjectives', event.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <RequirementsPackageListEditor
                    label="In Scope"
                    value={scopeForm.inScope}
                    tone="positive"
                    onChange={(value) => onScopeFieldChange('inScope', value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <RequirementsPackageListEditor
                    label="Out Of Scope"
                    value={scopeForm.outOfScope}
                    tone="negative"
                    onChange={(value) => onScopeFieldChange('outOfScope', value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Notes"
                    value={scopeForm.scopeDescription}
                    onChange={(event) => onScopeFieldChange('scopeDescription', event.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                  />
                </Grid>
              </Grid>
            ) : (
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={950}>User Stories</Typography>
                    <Typography variant="body2" color="text.secondary">Edit stories, priorities, and acceptance criteria in this package revision.</Typography>
                  </Box>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddStory}>Add User Story</Button>
                </Stack>
                {visibleStories.length === 0 ? (
                  <EmptyInline message="No user stories remain. Add at least one user story before sending updated requirements." />
                ) : visibleStories.map((story, index) => (
                  <Box key={story.localId} sx={{ p: 1.5, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
                    <Stack spacing={1.25}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                        <Typography variant="subtitle2" fontWeight={950}>
                          {story.storyKey || story.id ? (story.storyKey || `US-${String(story.id).padStart(3, '0')}`) : `New User Story ${index + 1}`}
                        </Typography>
                        <Button size="small" color="error" onClick={() => onRemoveStory(story.localId)}>Delete Story</Button>
                      </Stack>
                      <Grid container spacing={1.25}>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <TextField
                            label="Title"
                            value={story.title}
                            onChange={(event) => onStoryChange(story.localId, 'title', event.target.value)}
                            fullWidth
                            required
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField select label="Priority" value={story.priority} onChange={(event) => onStoryChange(story.localId, 'priority', event.target.value)} fullWidth>
                            {priorities.map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            label="Description"
                            value={story.description}
                            onChange={(event) => onStoryChange(story.localId, 'description', event.target.value)}
                            multiline
                            minRows={2}
                            fullWidth
                            required
                          />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            label="Acceptance Criteria"
                            value={story.acceptanceCriteria}
                            onChange={(event) => onStoryChange(story.localId, 'acceptanceCriteria', event.target.value)}
                            multiline
                            minRows={3}
                            fullWidth
                            required
                          />
                        </Grid>
                      </Grid>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
          <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2.25 }}>
            <TextField
              label="Explain Requirement Change"
              value={changeJustification}
              onChange={(event) => onChangeJustification(event.target.value)}
              placeholder="Describe why these changes are being made and what was updated."
              multiline
              minRows={3}
              fullWidth
              required
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        {hasChanges ? (
          <Button variant="contained" color="warning" onClick={onSubmit} disabled={submitDisabled}>
            Send Updated Requirements
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Edit scope or user stories to send an updated revision.
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}

function RequirementsPackageListEditor({ label, value, tone, onChange }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
      <Box sx={{ mt: 1 }}>
        <ScopeItemEditor value={value} onChange={onChange} tone={tone} />
      </Box>
    </Box>
  );
}

function ScopeEditorDialog({ open, primaryScope, scopeForm, updateScopeField, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{primaryScope ? 'Edit Scope' : 'Create Scope'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <TextField
            label="Scope Title"
            value={scopeForm.scopeTitle}
            onChange={(event) => updateScopeField('scopeTitle', event.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Business Objectives"
            value={scopeForm.businessObjectives}
            onChange={(event) => updateScopeField('businessObjectives', event.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
          <Grid container spacing={1.25}>
            <Grid size={{ xs: 12, md: 6 }}>
              <RequirementsPackageListEditor
                label="In Scope"
                value={scopeForm.inScope}
                tone="positive"
                onChange={(value) => updateScopeField('inScope', value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <RequirementsPackageListEditor
                label="Out Of Scope"
                value={scopeForm.outOfScope}
                tone="negative"
                onChange={(value) => updateScopeField('outOfScope', value)}
              />
            </Grid>
          </Grid>
          <TextField
            label="Notes"
            value={scopeForm.scopeDescription}
            onChange={(event) => updateScopeField('scopeDescription', event.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={!scopeForm.scopeTitle?.trim()}>
          {primaryScope ? 'Update Scope' : 'Create Scope'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StoryEditorDialog({ open, mode, story, storyForm, updateStoryField, closeStoryDialog, saveStory, storyValidationError, canEdit }) {
  const readOnly = mode === 'view' || !canEdit;
  const title = mode === 'view' ? 'View User Story' : mode === 'edit' ? 'Edit User Story' : 'Add User Story';

  return (
    <Dialog open={open} onClose={closeStoryDialog} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          {story && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <StatusBadge value={story.story_key || `US-${String(story.id).padStart(3, '0')}`} />
              <StatusBadge value={story.priority} />
              <StatusBadge value={story.status} />
            </Stack>
          )}
          <TextField
            label="Title"
            value={storyForm.title}
            onChange={(e) => updateStoryField('title', e.target.value)}
            fullWidth
            disabled={readOnly}
            helperText={readOnly ? '' : 'Minimum 3 characters.'}
            error={!readOnly && storyForm.title.trim().length > 0 && storyForm.title.trim().length < 3}
          />
          <TextField select label="Priority" value={storyForm.priority} onChange={(e) => updateStoryField('priority', e.target.value)} fullWidth disabled={readOnly}>
            {priorities.map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
          </TextField>
          <TextField
            label="Description"
            value={storyForm.description}
            onChange={(e) => updateStoryField('description', e.target.value)}
            fullWidth
            multiline
            minRows={3}
            disabled={readOnly}
            helperText={readOnly ? '' : 'Minimum 10 characters.'}
            error={!readOnly && storyForm.description.trim().length > 0 && storyForm.description.trim().length < 10}
          />
          <TextField
            label="Acceptance Criteria"
            value={storyForm.acceptanceCriteria}
            onChange={(e) => updateStoryField('acceptanceCriteria', e.target.value)}
            fullWidth
            multiline
            minRows={3}
            disabled={readOnly}
            helperText={readOnly ? '' : 'Minimum 5 characters.'}
            error={!readOnly && storyForm.acceptanceCriteria.trim().length > 0 && storyForm.acceptanceCriteria.trim().length < 5}
          />
          {!readOnly && storyValidationError && (
            <Alert severity="info">{storyValidationError}</Alert>
          )}
          {story?.review_comments && (
            <Alert severity={story.status === 'APPROVED' ? 'success' : 'warning'}>
              Department comments: {story.review_comments}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={closeStoryDialog}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && <Button variant="contained" onClick={saveStory} disabled={Boolean(storyValidationError)}>{mode === 'edit' ? 'Update Story' : 'Add Story'}</Button>}
      </DialogActions>
    </Dialog>
  );
}

function ReviewerEditCommentDialog({ dialog, onCommentChange, onClose, onSubmit }) {
  const commentTooShort = dialog.comment.trim().length < 3;
  return (
    <Dialog open={dialog.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Explain Requirement Change</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <Alert severity="info">
            This edit creates a new revision and sends the updated requirements to {dialog.targetLabel || 'the other reviewer'}. You cannot approve the same revision you modified.
          </Alert>
          <TextField
            label={`${dialog.artifactLabel || 'Requirement'} change comment`}
            value={dialog.comment}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="Explain what changed and what the PM should review."
            multiline
            minRows={4}
            fullWidth
            required
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onSubmit} disabled={commentTooShort}>
          Send Updated Requirements
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DevelopmentProgressPanel({ request, tasks = [] }) {
  const progress = request.status === 'CLOSED'
    ? 100
    : tasks.length ? getTaskProgress(tasks) : Number(request.progress_percentage || request.latest_progress_percentage || 0);

  return (
    <WorkspacePanel title="Progress" caption="Automatically calculated from completed sprints">
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
              <ProgressMeta label="Calculation" value="Completed tasks / total tasks" />
              <ProgressMeta label="Updated By" value="System" />
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.4 }}>
            Project completion is calculated as completed tasks divided by total tasks. Developers do not enter percentages.
          </Typography>
        </Box>
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

function UpdateRequestDetailsDialog({ open, mode = 'request', form, setForm, onClose, onSubmit, fullScreen = false }) {
  const isBusinessContextMode = mode === 'businessContext';
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2.5 } }}>
      <DialogTitle sx={{ pr: 7 }}>
        <Typography variant="h6">{isBusinessContextMode ? 'Edit Business Context' : 'Update Request Details'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {isBusinessContextMode
            ? 'Update the business justification, description, and expected benefits before completing department review.'
            : 'Update the request information requested by the approver, then respond and resubmit.'}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" spacing={2} onSubmit={onSubmit}>
          {!isBusinessContextMode && (
            <TextField
              label="Request Title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              fullWidth
            />
          )}
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
            <Button type="submit" variant="contained">{isBusinessContextMode ? 'Save Business Context' : 'Save Updates'}</Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

const PDF_BRAND = {
  primary: [29, 78, 216],
  primaryDark: [15, 23, 42],
  teal: [15, 118, 110],
  slate: [71, 85, 105],
  muted: [100, 116, 139],
  border: [203, 213, 225],
  soft: [248, 250, 252],
  softBlue: [239, 246, 255],
  success: [22, 163, 74],
  warning: [217, 119, 6],
  danger: [220, 38, 38],
  white: [255, 255, 255],
};

const PDF_LAYOUT = {
  marginX: 16,
  top: 16,
  bottom: 276,
  width: 210,
  contentWidth: 178,
};

function setPdfColor(doc, color) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setPdfDraw(doc, color) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setPdfFill(doc, color) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function pdfText(doc, text, x, y, options = {}) {
  const {
    size = 9,
    style = 'normal',
    color = PDF_BRAND.primaryDark,
    maxWidth = PDF_LAYOUT.contentWidth,
    lineHeight = 5,
    align = 'left',
  } = options;
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  setPdfColor(doc, color);
  const lines = doc.splitTextToSize(String(text || 'Not available'), maxWidth);
  doc.text(lines, x, y, { align });
  return y + (lines.length * lineHeight);
}

function getPdfWrappedLines(doc, text, maxWidth, { size = 9, style = 'normal' } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  return doc.splitTextToSize(String(text || 'Not available'), maxWidth);
}

function ensurePdfSpace(doc, y, height) {
  if (y + height > PDF_LAYOUT.bottom) {
    doc.addPage();
    return PDF_LAYOUT.top;
  }
  return y;
}

function loadPdfImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawPdfLogo(doc, logoImage, x, y, width = 36, height = 23) {
  if (logoImage) {
    const ratio = logoImage.naturalWidth / logoImage.naturalHeight;
    const imageWidth = Math.min(width, height * ratio);
    const imageHeight = imageWidth / ratio;
    doc.addImage(logoImage, 'PNG', x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  }
}

function drawPdfFooter(doc, generatedAt) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    setPdfDraw(doc, PDF_BRAND.border);
    doc.line(PDF_LAYOUT.marginX, 285, PDF_LAYOUT.width - PDF_LAYOUT.marginX, 285);
    pdfText(doc, 'Violin Technologies', PDF_LAYOUT.marginX, 290, { size: 7.5, style: 'bold', color: PDF_BRAND.slate, maxWidth: 45 });
    pdfText(doc, 'RequestOps Workflow Management Platform', 58, 290, { size: 7.5, color: PDF_BRAND.muted, maxWidth: 58 });
    pdfText(doc, `Report Generated: ${generatedAt}`, 122, 290, { size: 7.5, color: PDF_BRAND.muted, maxWidth: 45 });
    pdfText(doc, `Page ${page} of ${pageCount}`, 172, 290, { size: 7.5, color: PDF_BRAND.muted, maxWidth: 22 });
    pdfText(doc, 'Confidential/Internal Use Only', PDF_LAYOUT.marginX, 294, { size: 7, style: 'bold', color: PDF_BRAND.danger, maxWidth: 80 });
  }
}

function drawPdfCoverHeader(doc, { request, generatedAt, generatedBy, roi, logoImage }) {
  setPdfFill(doc, PDF_BRAND.primaryDark);
  doc.rect(0, 0, 210, 48, 'F');
  setPdfFill(doc, [30, 64, 175]);
  doc.rect(0, 0, 210, 3, 'F');
  setPdfFill(doc, PDF_BRAND.teal);
  doc.rect(0, 3, 62, 1.4, 'F');

  drawPdfLogo(doc, logoImage, 11, 9.5, 58, 36);

  pdfText(doc, 'Violin Technologies', 73, 15, { size: 9.8, style: 'bold', color: PDF_BRAND.white, maxWidth: 57 });
  pdfText(doc, 'RequestOps Workflow Management Platform', 73, 21, { size: 7.1, color: [203, 213, 225], maxWidth: 65 });
  pdfText(doc, 'ISMS Project Closure Report', 73, 33, { size: 13.4, style: 'bold', color: PDF_BRAND.white, maxWidth: 67, lineHeight: 4.8 });

  const metaLabelX = 139;
  const metaValueX = 163;
  const metaRows = [
    ['Request ID', request.request_number],
    ['Generated On', generatedAt],
    ['Status', formatEnum(request.status)],
    ['Generated By', generatedBy],
  ];
  metaRows.forEach(([label, value], index) => {
    const rowY = 13.5 + (index * 7.2);
    pdfText(doc, `${label}:`, metaLabelX, rowY, { size: 6.4, style: 'bold', color: [148, 163, 184], maxWidth: 22 });
    pdfText(doc, value, metaValueX, rowY, { size: 6.4, color: [226, 232, 240], maxWidth: 34, lineHeight: 3.2 });
  });

  const summaryTop = 58;
  const summaryTitle = request.title || 'Not provided';
  const summaryBenefits = request.expected_benefits || request.business_justification || 'Business outcome not provided.';
  const projectLines = getPdfWrappedLines(doc, summaryTitle, 104, { size: 9.1, style: 'bold' });
  const benefitLines = getPdfWrappedLines(doc, summaryBenefits, 104, { size: 8.1 });
  const summaryHeight = Math.max(64, 32 + (projectLines.length * 4.9) + (benefitLines.length * 4.7));
  setPdfFill(doc, PDF_BRAND.white);
  setPdfDraw(doc, PDF_BRAND.border);
  doc.roundedRect(16, summaryTop, 178, summaryHeight, 3.5, 3.5, 'FD');
  setPdfFill(doc, PDF_BRAND.primary);
  doc.roundedRect(16, summaryTop, 178, 2.4, 3.5, 3.5, 'F');
  pdfText(doc, 'Executive Summary', 24, summaryTop + 14, { size: 12.4, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: 72 });
  pdfText(doc, 'Project Name', 24, summaryTop + 23, { size: 6.8, style: 'bold', color: PDF_BRAND.muted, maxWidth: 42 });
  const afterProject = pdfText(doc, summaryTitle, 24, summaryTop + 29, { size: 9.1, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: 104, lineHeight: 4.9 });
  pdfText(doc, 'Business Benefits', 24, afterProject + 5, { size: 6.8, style: 'bold', color: PDF_BRAND.muted, maxWidth: 46 });
  pdfText(doc, summaryBenefits, 24, afterProject + 11, { size: 8.1, color: PDF_BRAND.slate, maxWidth: 104, lineHeight: 4.7 });

  drawPdfPill(doc, 140, summaryTop + 16, 'Department', request.department_name);
  drawPdfPill(doc, 140, summaryTop + 31, 'Status', formatEnum(request.status));
  drawPdfPill(doc, 140, summaryTop + 46, 'Impact', roi.typeLabel);

  return summaryTop + summaryHeight + 12;
}

function drawPdfPill(doc, x, y, label, value) {
  setPdfFill(doc, [248, 250, 252]);
  setPdfDraw(doc, [226, 232, 240]);
  doc.roundedRect(x, y - 7, 46, 10, 4.5, 4.5, 'FD');
  pdfText(doc, label, x + 3.2, y - 2.7, { size: 5.5, style: 'bold', color: PDF_BRAND.muted, maxWidth: 15, lineHeight: 2.5 });
  pdfText(doc, value || 'Not available', x + 18, y - 2.7, { size: 6.5, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: 24, lineHeight: 2.8 });
}

function drawPdfSummaryCards(doc, y, cards) {
  const gap = 4;
  const columns = 4;
  const cardWidth = (PDF_LAYOUT.contentWidth - (gap * (columns - 1))) / columns;
  const cardHeights = cards.map((card) => {
    const labelLines = getPdfWrappedLines(doc, card.label, cardWidth - 7, { size: 6.8, style: 'bold' });
    const valueLines = getPdfWrappedLines(doc, card.value || 'Not available', cardWidth - 7, { size: card.emphasis ? 8.8 : 8.4 });
    return Math.max(21, 8 + (labelLines.length * 3.2) + 2 + (valueLines.length * 3.8));
  });
  const rowHeights = [];
  for (let index = 0; index < cards.length; index += columns) {
    rowHeights.push(Math.max(...cardHeights.slice(index, index + columns)));
  }
  cards.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const previousRowsHeight = rowHeights.slice(0, row).reduce((total, height) => total + height + gap, 0);
    const cardHeight = rowHeights[row];
    const x = PDF_LAYOUT.marginX + (col * (cardWidth + gap));
    const cy = y + previousRowsHeight;
    setPdfFill(doc, PDF_BRAND.soft);
    setPdfDraw(doc, [226, 232, 240]);
    doc.roundedRect(x, cy, cardWidth, cardHeight, 2.5, 2.5, 'FD');
    pdfText(doc, String(card.label), x + cardWidth / 2, cy + 8, { size: 6.8, style: 'bold', color: PDF_BRAND.muted, maxWidth: cardWidth - 7, align: 'center', lineHeight: 3 });
    pdfText(doc, String(card.value || 'Not available'), x + cardWidth / 2, cy + 16, { size: card.emphasis ? 8.8 : 8.4, style: 'normal', color: card.emphasis ? PDF_BRAND.primary : PDF_BRAND.primaryDark, maxWidth: cardWidth - 7, align: 'center', lineHeight: 3.8 });
  });
  return y + rowHeights.reduce((total, height) => total + height + gap, 0) + 8;
}

function drawPdfSectionTitle(doc, y, number, title) {
  y = ensurePdfSpace(doc, y + 8, 22);
  pdfText(doc, `${number} ${title}`, PDF_LAYOUT.marginX, y, { size: 13.5, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: 150 });
  setPdfDraw(doc, PDF_BRAND.border);
  doc.line(PDF_LAYOUT.marginX, y + 6.5, PDF_LAYOUT.width - PDF_LAYOUT.marginX, y + 6.5);
  return y + 17;
}

function drawPdfParagraph(doc, y, label, value) {
  y = ensurePdfSpace(doc, y, 18);
  pdfText(doc, label, PDF_LAYOUT.marginX, y, { size: 9, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: PDF_LAYOUT.contentWidth });
  return pdfText(doc, value || 'Not provided', PDF_LAYOUT.marginX, y + 6, { size: 8.7, color: PDF_BRAND.slate, maxWidth: PDF_LAYOUT.contentWidth, lineHeight: 5.2 }) + 5;
}

function drawPdfKeyValueGrid(doc, y, rows) {
  const colWidth = 86;
  const rowGap = 5;
  for (let index = 0; index < rows.length; index += 2) {
    const rowItems = rows.slice(index, index + 2);
    const itemHeights = rowItems.map(([label, value]) => {
      const labelLines = getPdfWrappedLines(doc, String(label).toUpperCase(), colWidth - 8, { size: 6.3, style: 'bold' });
      const valueLines = getPdfWrappedLines(doc, value || 'Not available', colWidth - 8, { size: 8.2, style: 'bold' });
      return Math.max(19, 8 + (labelLines.length * 3.1) + 2 + (valueLines.length * 4.4));
    });
    const rowHeight = Math.max(...itemHeights);
    y = ensurePdfSpace(doc, y, rowHeight + rowGap);
    rowItems.forEach(([label, value], col) => {
      const x = PDF_LAYOUT.marginX + (col * (colWidth + 6));
      const rowY = y;
      setPdfFill(doc, PDF_BRAND.soft);
      setPdfDraw(doc, PDF_BRAND.border);
      doc.roundedRect(x, rowY - 4, colWidth, rowHeight, 2, 2, 'FD');
      pdfText(doc, String(label).toUpperCase(), x + 4, rowY + 1.5, { size: 6.3, style: 'bold', color: PDF_BRAND.muted, maxWidth: colWidth - 8, lineHeight: 3.1 });
      pdfText(doc, value || 'Not available', x + 4, rowY + 9, { size: 8.2, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: colWidth - 8, lineHeight: 4.4 });
    });
    y += rowHeight + rowGap;
  }
  return y + 4;
}

function drawPdfCallout(doc, y, title, body, tone = 'info') {
  const color = tone === 'warning' ? PDF_BRAND.warning : tone === 'success' ? PDF_BRAND.success : tone === 'closure' ? [79, 70, 229] : PDF_BRAND.primary;
  const lines = doc.splitTextToSize(String(body || 'Not provided'), 162);
  const lineHeight = tone === 'closure' ? 5.4 : 5;
  const height = (tone === 'closure' ? 20 : 16) + (lines.length * lineHeight);
  y = ensurePdfSpace(doc, y, height + 7);
  setPdfFill(doc, tone === 'closure' ? [238, 242, 255] : PDF_BRAND.softBlue);
  setPdfDraw(doc, [191, 219, 254]);
  doc.roundedRect(PDF_LAYOUT.marginX, y, PDF_LAYOUT.contentWidth, height, 3, 3, 'FD');
  setPdfFill(doc, color);
  doc.rect(PDF_LAYOUT.marginX, y, tone === 'closure' ? 3 : 2, height, 'F');
  pdfText(doc, title, PDF_LAYOUT.marginX + 7, y + 8, { size: tone === 'closure' ? 10 : 9, style: 'bold', color, maxWidth: 160 });
  pdfText(doc, body || 'Not provided', PDF_LAYOUT.marginX + 7, y + (tone === 'closure' ? 17 : 15), { size: tone === 'closure' ? 9 : 8.5, color: PDF_BRAND.slate, maxWidth: 160, lineHeight });
  return y + height + 7;
}

function pdfTimelineTone(status = '') {
  if (status.includes('REJECTED') || status.includes('FAILED')) return PDF_BRAND.danger;
  if (status.includes('APPROVED') || status.includes('PASSED') || status === 'CLOSED') return PDF_BRAND.success;
  if (status.includes('QA') || status.includes('TEST')) return [124, 58, 237];
  if (status.includes('DEPLOY')) return PDF_BRAND.teal;
  if (status.includes('DEVELOP') || status.includes('SPRINT')) return PDF_BRAND.warning;
  return PDF_BRAND.primary;
}

const workflowMilestoneLabels = {
  SUBMITTED: 'Submitted',
  DEPARTMENT_APPROVAL_PENDING: 'Department Review',
  CLARIFICATION_REQUESTED: 'Clarification Requested',
  DEPARTMENT_REJECTED: 'Department Rejected',
  IT_REVIEW_PENDING: 'Internal Review Started',
  IT_REJECTED: 'IT Rejected',
  DEFERRED: 'Deferred',
  ASSIGNMENT_PENDING: 'IT Approved',
  PM_ASSIGNED: 'Project Manager Assigned',
  SCOPE_REVIEW: 'Scope Planning',
  USER_STORY_REVIEW: 'User Story Review',
  REQUIREMENTS_DEPARTMENT_REVIEW: 'Department Requirements Review',
  REQUIREMENTS_PM_REVIEW: 'PM Requirements Review',
  REQUIREMENTS_IT_REVIEW: 'IT Requirements Review',
  REQUIREMENTS_CLARIFICATION_REQUESTED: 'Requirements Clarification',
  REQUIREMENTS_APPROVED: 'Requirements Approved',
  DEVELOPER_ASSIGNED: 'Team Assigned',
  SPRINT_PLANNING: 'Sprint Planning',
  SPRINT_ACTIVE: 'Development Started',
  QA_PENDING: 'QA Review',
  QA_FAILED: 'QA Failed',
  QA_PASSED: 'QA Passed',
  UAT_PENDING: 'Requester UAT',
  UAT_FAILED: 'UAT Failed',
  UAT_APPROVED: 'UAT Approved',
  DEPLOYMENT_PENDING: 'Final Deployment Pending',
  DEPLOYED: 'Deployed',
  READY_FOR_COMPLETION: 'Ready For Closure',
  CLOSED: 'Sign-Off',
};

function buildWorkflowMilestones(events = []) {
  const milestones = [];
  events.forEach((event) => {
    const stageName = workflowMilestoneLabels[event.to_status];
    if (!stageName) return;
    const previous = milestones[milestones.length - 1];
    const next = {
      ...event,
      stageName,
      summaryComment: event.comment || `${stageName}.`,
    };
    if (previous?.stageName === stageName) {
      milestones[milestones.length - 1] = { ...previous, summaryComment: next.summaryComment, changed_at: next.changed_at, changed_by_name: next.changed_by_name };
      return;
    }
    milestones.push(next);
  });
  return milestones;
}

function drawMilestoneMarker(doc, x, y, tone) {
  setPdfFill(doc, tone);
  doc.circle(x, y, 3.1, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.55);
  doc.line(x - 1.25, y, x - 0.25, y + 1);
  doc.line(x - 0.25, y + 1, x + 1.45, y - 1.25);
  doc.setLineWidth(0.2);
}

function drawPdfWorkflowJourney(doc, y, events) {
  const milestones = buildWorkflowMilestones(events);
  if (!milestones.length) return drawPdfCallout(doc, y, 'Workflow & Approval Journey', 'No workflow journey has been recorded.');
  const lineX = PDF_LAYOUT.marginX + 4;
  milestones.forEach((event, index) => {
    const comment = event.summaryComment || 'No comment recorded.';
    const commentLines = doc.splitTextToSize(String(comment), 140);
    const height = Math.max(28, 20 + (commentLines.length * 5));
    y = ensurePdfSpace(doc, y, height + 6);
    const tone = pdfTimelineTone(event.to_status);
    if (index < milestones.length - 1) {
      setPdfDraw(doc, PDF_BRAND.border);
      doc.line(lineX, y + 5, lineX, y + height + 6);
    }
    drawMilestoneMarker(doc, lineX, y + 5, tone);
    setPdfFill(doc, PDF_BRAND.white);
    setPdfDraw(doc, PDF_BRAND.border);
    doc.roundedRect(lineX + 8, y - 2, 166, height, 2.5, 2.5, 'FD');
    pdfText(doc, event.stageName, lineX + 13, y + 6, { size: 9.4, style: 'bold', color: PDF_BRAND.primaryDark, maxWidth: 70 });
    pdfText(doc, event.changed_by_name || 'System', lineX + 88, y + 6, { size: 8, style: 'bold', color: PDF_BRAND.slate, maxWidth: 38 });
    pdfText(doc, formatFullDateTime(event.changed_at), lineX + 127, y + 6, { size: 7.4, color: PDF_BRAND.muted, maxWidth: 42 });
    pdfText(doc, comment, lineX + 13, y + 15, { size: 8.2, color: PDF_BRAND.slate, maxWidth: 150, lineHeight: 5 });
    y += height + 5;
  });
  return y + 4;
}

function drawPdfBulletList(doc, y, title, items, empty) {
  y = ensurePdfSpace(doc, y, 12);
  pdfText(doc, title, PDF_LAYOUT.marginX, y, { size: 9, style: 'bold', color: PDF_BRAND.primaryDark });
  y += 6;
  const list = items.length ? items : [empty];
  list.forEach((item) => {
    const lines = doc.splitTextToSize(String(item), 166);
    y = ensurePdfSpace(doc, y, (lines.length * 5) + 5);
    setPdfFill(doc, PDF_BRAND.primary);
    doc.circle(PDF_LAYOUT.marginX + 1.5, y - 1.5, 0.8, 'F');
    pdfText(doc, item, PDF_LAYOUT.marginX + 5, y, { size: 8.3, color: PDF_BRAND.slate, maxWidth: 166, lineHeight: 5 });
    y += lines.length * 5 + 3;
  });
  return y + 4;
}

function getProjectReportTitle(request) {
  return ['READY_FOR_COMPLETION', 'CLOSED'].includes(request?.status) ? 'Final ISMS Project Closure Report' : 'Request Management Report';
}

function getInvolvedUsers(request, tasks = []) {
  const users = [
    ['Requester', request.requester_name],
    ['Department Head', request.department_head_name],
    ['IT Head', request.it_head_name],
    ['Project Manager', request.project_manager_name],
    ['QA Engineer', request.active_qa_name],
  ];
  const developerNames = new Set(tasks.map((task) => task.assigned_developer_name).filter(Boolean));
  if (request.active_developer_name) developerNames.add(request.active_developer_name);
  developerNames.forEach((name) => users.push(['Developer', name]));
  return users.filter(([, name]) => Boolean(name));
}

function getTimelineEvent(timeline = [], status) {
  return [...timeline].reverse().find((item) => item.to_status === status);
}

function getTimelineEvents(timeline = [], statuses = []) {
  const statusSet = new Set(statuses);
  return timeline.filter((item) => statusSet.has(item.to_status));
}

function getEmployeeClosureNote(timeline = [], request) {
  const closureEvents = timeline.filter((item) => item.to_status === 'CLOSED');
  const reversed = [...closureEvents].reverse();
  return reversed.find((item) => Number(item.changed_by_user_id) === Number(request?.requester_user_id)) || reversed[0] || null;
}

function formatWorkflowEvent(item) {
  const transition = `${item.from_status ? formatEnum(item.from_status) : 'Start'} -> ${formatEnum(item.to_status)}`;
  return `${formatFullDateTime(item.changed_at)} - ${item.changed_by_name}: ${transition}${item.comment ? ` - ${item.comment}` : ''}`;
}

async function downloadRequestReportPdf({ request, attachments, timeline, tasks = [], generatedBy = 'RequestOps User' }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let logoImage = null;
  try {
    logoImage = await loadPdfImage(violinLogoUrl);
  } catch {
    logoImage = null;
  }
  const roi = calculateRoi(normalizeRoiFromRequest(request));
  const progress = tasks.length ? getTaskProgress(tasks) : Number(request.progress_percentage || 0);
  const closure = getEmployeeClosureNote(timeline, request);
  const employeeClosureNote = closure;
  const qaEvents = getTimelineEvents(timeline, ['QA_PASSED', 'QA_FAILED']);
  const uatEvents = getTimelineEvents(timeline, ['UAT_APPROVED', 'UAT_FAILED', 'UAT_REJECTED']);
  const deploymentEvents = getTimelineEvents(timeline, ['DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION']);
  const generatedAt = formatFullDateTime(new Date().toISOString());
  const revenueImpact = request.roi_estimated_revenue_impact_inr
    ? formatPdfInr(request.roi_estimated_revenue_impact_inr)
    : 'Not provided';
  let y = drawPdfCoverHeader(doc, { request, generatedAt, generatedBy, roi, logoImage });

  const annualSavings = roi.annualCostSavings ? formatPdfInr(roi.annualCostSavings) : roi.costSavingsLabel.replace('₹', 'INR ');
  const estimatedRoi = roi.estimatedRoi ? formatPdfInr(roi.estimatedRoi) : roi.estimatedRoiLabel.replace('₹', 'INR ');

  y = drawPdfSummaryCards(doc, y, [
    { label: 'Request ID', value: request.request_number },
    { label: 'Priority', value: formatEnum(request.priority) },
    { label: 'Status', value: formatEnum(request.status) },
    { label: 'Department', value: request.department_name || 'Not assigned' },
    { label: 'Users Impacted', value: request.roi_users_impacted ? Number(request.roi_users_impacted).toLocaleString('en-IN') : 'Not specified' },
    { label: 'Annual Savings', value: annualSavings },
    { label: 'ROI', value: estimatedRoi, emphasis: true },
  ]);

  y = drawPdfSectionTitle(doc, y, '01', 'Executive Summary');
  y = drawPdfParagraph(doc, y, 'Request Overview', `${request.title} is a ${formatEnum(request.request_type)} request currently marked as ${formatEnum(request.status)}.`);
  y = drawPdfParagraph(doc, y, 'Purpose', request.business_justification);
  y = drawPdfCallout(doc, y, 'Expected Business Outcome', request.expected_benefits || 'No expected benefits were provided.', 'info');

  y = drawPdfSectionTitle(doc, y, '02', 'Request Information');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Request ID', request.request_number],
    ['Request Title', request.title],
    ['Request Type', formatEnum(request.request_type)],
    ['Requester Details', request.requester_name],
    ['Department', request.department_name],
    ['Date Submitted', formatFullDateTime(request.submitted_at || request.created_at)],
    ['Priority', formatEnum(request.priority)],
    ['Current Status', formatEnum(request.status)],
  ]);

  y = drawPdfSectionTitle(doc, y, '03', 'Business Justification');
  y = drawPdfParagraph(doc, y, 'Problem Statement', request.business_justification);
  y = drawPdfParagraph(doc, y, 'Current Challenges', request.description);
  y = drawPdfParagraph(doc, y, 'Proposed Solution', request.title);
  y = drawPdfParagraph(doc, y, 'Expected Benefits', request.expected_benefits || 'Not provided');

  y = drawPdfSectionTitle(doc, y, '04', 'ROI & Business Impact');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Users Impacted', request.roi_users_impacted || 'Not specified'],
    ['Monthly Time Savings', formatHours(roi.monthlyHours)],
    ['Annual Time Savings', formatHours(roi.annualHours)],
    ['Annual Savings', annualSavings],
    ['Revenue Impact', revenueImpact],
    ['Business Impact Category', roi.typeLabel],
    ['Automation Percentage', roi.automationLabel],
    ['Estimated ROI', estimatedRoi],
  ]);
  y = drawPdfCallout(doc, y, 'Calculated ROI Metrics', 'Annual cost savings are calculated from yearly saved hours and estimated hourly cost. Estimated ROI includes optional revenue impact where provided.', 'success');

  y = drawPdfSectionTitle(doc, y, '05', 'Analysis & Review Summary');
  y = drawPdfParagraph(doc, y, 'IT Review Notes', request.feasibility_notes || 'No IT review notes recorded.');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Feasibility Assessment', request.complexity ? formatEnum(request.complexity) : 'Not available'],
    ['Resource Assessment', `Developer: ${request.active_developer_name || 'Not assigned'}; QA: ${request.active_qa_name || 'Not assigned'}`],
    ['Estimated Effort', request.estimated_effort || 'Not available'],
  ]);
  y = drawPdfCallout(doc, y, 'Risks and Dependencies', 'No explicit risks or dependencies are recorded in the current workflow.', 'warning');

  y = drawPdfSectionTitle(doc, y, '06', 'Development & Testing Summary');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Delivery Progress', `${progress}%`],
    ['Development Tasks', tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} recorded` : 'No sprint task evidence recorded'],
  ]);
  y = drawPdfBulletList(doc, y, 'Development Notes', tasks.map((task) => `${task.task_key || `TASK-${task.id}`}: ${task.title} - ${formatEnum(task.status)} - Owner: ${task.assigned_developer_name || 'Unassigned'}`), 'No development notes or sprint tasks recorded.');
  y = drawPdfBulletList(doc, y, 'QA Summary', qaEvents.map(formatWorkflowEvent), 'No QA summary recorded.');
  y = drawPdfBulletList(doc, y, 'UAT Summary', uatEvents.map(formatWorkflowEvent), 'No UAT summary recorded.');
  y = drawPdfBulletList(doc, y, 'Deployment Notes', deploymentEvents.map(formatWorkflowEvent), 'No deployment notes recorded.');

  y = drawPdfSectionTitle(doc, y, '07', 'Employee Closure Statement');
  y = drawPdfCallout(doc, y, employeeClosureNote ? `Final closure note by ${employeeClosureNote.changed_by_name}` : 'Awaiting Employee Closure Statement', employeeClosureNote?.comment || 'The employee has not provided a final closure note yet.', 'closure');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Employee Name', employeeClosureNote?.changed_by_name || request.requester_name || 'Not available'],
    ['Completion Date', employeeClosureNote ? formatFullDateTime(employeeClosureNote.changed_at) : 'Not available'],
    ['Final Status', closure ? formatEnum(request.status) : 'Not closed'],
  ]);

  y = drawPdfSectionTitle(doc, y, '08', 'Recommendations & Conclusion');
  y = drawPdfParagraph(doc, y, 'Final Observations', `Request is currently ${formatEnum(request.status)} with ${progress}% recorded delivery progress.`);
  y = drawPdfCallout(doc, y, 'Recommendation', 'Retain workflow approvals, comments, attachments, and delivery evidence for audit traceability and management review.', 'info');
  y = drawPdfParagraph(doc, y, 'Closure Summary', employeeClosureNote?.comment || 'Request is not yet closed by the employee.');
  y = drawPdfBulletList(doc, y, 'Supporting Evidence', attachments.map((item) => `${item.original_file_name} - ${item.uploaded_by_name} - ${formatFullDateTime(item.uploaded_at)}`), 'No attachments uploaded.');

  y = drawPdfSectionTitle(doc, y, '09', 'Workflow & Approval Journey');
  y = drawPdfKeyValueGrid(doc, y, [
    ['Department Head', request.department_head_name || 'Not assigned'],
    ['IT Head', request.it_head_name || 'Not assigned'],
    ['Project Manager', request.project_manager_name || 'Not assigned'],
    ['Pending With', getPendingWithName(request)],
  ]);
  y = drawPdfWorkflowJourney(doc, y, timeline);

  drawPdfFooter(doc, generatedAt);
  doc.save(`${request.request_number}-${['READY_FOR_COMPLETION', 'CLOSED'].includes(request.status) ? 'final-isms-report' : 'report'}.pdf`);
}

function RequestReportDialog({ open, request, attachments, timeline, tasks = [], generatedBy = 'RequestOps User', onClose, fullScreen = false }) {
  if (!request) return null;
  const roi = calculateRoi(normalizeRoiFromRequest(request));
  const progress = tasks.length ? getTaskProgress(tasks) : Number(request.progress_percentage || 0);
  const isFinalReport = ['READY_FOR_COMPLETION', 'CLOSED'].includes(request.status);
  const reportTitle = getProjectReportTitle(request);
  const closure = getTimelineEvent(timeline, 'CLOSED');
  const employeeClosureNote = getEmployeeClosureNote(timeline, request);
  const qaEvents = getTimelineEvents(timeline, ['QA_PASSED', 'QA_FAILED']);
  const uatEvents = getTimelineEvents(timeline, ['UAT_APPROVED', 'UAT_FAILED', 'UAT_REJECTED']);
  const deploymentEvents = getTimelineEvents(timeline, ['DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION']);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2, overflow: 'hidden' } }}
    >
      <DialogTitle sx={{ p: 0, bgcolor: (theme) => theme.custom.semantic.elevated }}>
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: { xs: 2, md: 2.25 },
            borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'flex-start' } }}>
            <Stack direction="row" spacing={1.4} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
              <Box sx={{ width: 42, height: 42, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', color: 'primary.main', border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, flexShrink: 0 }}>
                <InsertDriveFileOutlinedIcon />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1.1 }}>
                  ISMS BUSINESS ASSESSMENT REPORT
                </Typography>
                <Typography variant="h5" fontWeight={950} sx={{ mt: 0.2, overflowWrap: 'anywhere' }}>
                  {reportTitle}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip size="small" label={request.request_number} sx={{ fontWeight: 850 }} />
                  <Chip size="small" label="Internal Audit Record" variant="outlined" />
                  <StatusBadge value={request.status} />
                </Stack>
              </Box>
            </Stack>
            <IconButton onClick={onClose} size="small" sx={{ alignSelf: { xs: 'flex-end', md: 'flex-start' } }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: (theme) => theme.palette.mode === 'dark' ? theme.custom.semantic.paperSoft : '#F8FAFC' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 3 } }}>
          <Stack
            spacing={0}
            sx={{
              maxWidth: 980,
              mx: 'auto',
              bgcolor: (theme) => theme.custom.semantic.elevated,
              border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
              boxShadow: '0 18px 42px rgba(15,23,42,0.08)',
            }}
          >
            <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 2.5, md: 4 }, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
              <Typography variant="overline" color="text.secondary" fontWeight={900}>Confidential Internal Report</Typography>
              <Typography variant="h4" fontWeight={950} sx={{ mt: 0.5, lineHeight: 1.15 }}>{reportTitle}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Prepared for management review, audit traceability, and ISMS evidence retention.
              </Typography>
            </Box>

            <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 } }}>
              <Stack spacing={0}>
                <DocumentReportSection number="1" title="Executive Summary">
                  <ReportParagraph label="Overview" value={`${request.title} is a ${formatEnum(request.request_type)} request currently marked as ${formatEnum(request.status)}.`} />
                  <ReportParagraph label="Purpose" value={request.business_justification} />
                  <ReportCallout tone="info" title="Expected Business Outcome">
                    {request.expected_benefits || 'No expected benefits were provided.'}
                  </ReportCallout>
                </DocumentReportSection>

                <DocumentReportSection number="2" title="Request Information">
                  <ReportKeyValueGrid rows={[
                    ['Request ID', request.request_number],
                    ['Request Title', request.title],
                    ['Request Type', formatEnum(request.request_type)],
                    ['Requester Details', request.requester_name],
                    ['Department', request.department_name],
                    ['Date Submitted', formatFullDateTime(request.submitted_at || request.created_at)],
                    ['Priority', <StatusBadge key="priority" value={request.priority} />],
                    ['Current Status', <StatusBadge key="status" value={request.status} />],
                  ]} />
                </DocumentReportSection>

                <DocumentReportSection number="3" title="Business Justification">
                  <ReportParagraph label="Problem Statement" value={request.business_justification} />
                  <ReportParagraph label="Current Challenges" value={request.description} />
                  <ReportParagraph label="Proposed Solution" value={request.title} />
                  <ReportParagraph label="Expected Benefits" value={request.expected_benefits || 'Not provided'} />
                </DocumentReportSection>

                <DocumentReportSection number="4" title="ROI & Business Impact">
                  <ReportKeyValueGrid rows={[
                    ['Users Impacted', request.roi_users_impacted || 'Not specified'],
                    ['Monthly Time Savings', formatHours(roi.monthlyHours)],
                    ['Annual Time Savings', formatHours(roi.annualHours)],
                    ['Annual Savings', roi.costSavingsLabel],
                    ['Revenue Impact', request.roi_estimated_revenue_impact_inr ? formatInr(request.roi_estimated_revenue_impact_inr) : 'Not provided'],
                    ['Business Impact Category', roi.typeLabel],
                    ['Automation Percentage', roi.automationLabel],
                    ['Estimated ROI', roi.estimatedRoiLabel],
                  ]} />
                  <ReportCallout tone="success" title="Calculated ROI Metrics">
                    Annual cost savings are calculated from yearly saved hours and estimated hourly cost. Estimated ROI includes optional revenue impact where provided.
                  </ReportCallout>
                </DocumentReportSection>

                <DocumentReportSection number="5" title="Analysis & Review Summary">
                  <ReportParagraph label="IT Review Notes" value={request.feasibility_notes || 'No IT review notes recorded.'} />
                  <ReportKeyValueGrid rows={[
                    ['Feasibility Assessment', request.complexity ? formatEnum(request.complexity) : 'Not available'],
                    ['Resource Assessment', `Developer: ${request.active_developer_name || 'Not assigned'}; QA: ${request.active_qa_name || 'Not assigned'}`],
                    ['Estimated Effort', request.estimated_effort || 'Not available'],
                  ]} />
                  <ReportCallout tone="warning" title="Risks and Dependencies">
                    No explicit risks or dependencies are recorded in the current workflow.
                  </ReportCallout>
                </DocumentReportSection>

                <DocumentReportSection number="6" title="Development & Testing Summary">
                  <ReportKeyValueGrid rows={[
                    ['Delivery Progress', `${progress}%`],
                    ['Development Tasks', tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} recorded` : 'No sprint task evidence recorded'],
                  ]} />
                  <ReportBulletList title="Development Notes" items={tasks.map((task) => `${task.task_key || `TASK-${task.id}`}: ${task.title} - ${formatEnum(task.status)} - Owner: ${task.assigned_developer_name || 'Unassigned'}`)} empty="No development notes or sprint tasks recorded." />
                  <ReportBulletList title="QA Summary" items={qaEvents.map(formatWorkflowEvent)} empty="No QA summary recorded." />
                  <ReportBulletList title="UAT Summary" items={uatEvents.map(formatWorkflowEvent)} empty="No UAT summary recorded." />
                  <ReportBulletList title="Deployment Notes" items={deploymentEvents.map(formatWorkflowEvent)} empty="No deployment notes recorded." />
                </DocumentReportSection>

                <DocumentReportSection number="7" title="Employee Closure Statement">
                  <ReportCallout tone="closure" title={employeeClosureNote ? `Closure note by ${employeeClosureNote.changed_by_name}` : 'Awaiting Employee Closure Note'}>
                    {employeeClosureNote?.comment || 'The employee has not provided a final closure note yet.'}
                  </ReportCallout>
                  <ReportKeyValueGrid rows={[
                    ['Employee Name', employeeClosureNote?.changed_by_name || request.requester_name || 'Not available'],
                    ['Timestamp', employeeClosureNote ? formatFullDateTime(employeeClosureNote.changed_at) : 'Not available'],
                    ['Closure Status', closure ? formatEnum(request.status) : (isFinalReport ? 'Awaiting requester completion' : 'Not ready for closure')],
                  ]} />
                </DocumentReportSection>

                <DocumentReportSection number="8" title="Recommendations & Conclusion">
                  <ReportParagraph label="Final Observations" value={`Request is currently ${formatEnum(request.status)} with ${progress}% recorded delivery progress.`} />
                  <ReportCallout tone="info" title="Recommendation">
                    Retain workflow approvals, comments, attachments, and delivery evidence for audit traceability and management review.
                  </ReportCallout>
                  <ReportParagraph label="Closure Summary" value={employeeClosureNote?.comment || 'Request is not yet closed by the employee.'} />
                  <ReportBulletList title="Supporting Evidence" items={attachments.map((item) => `${item.original_file_name} - ${item.uploaded_by_name} - ${formatFullDateTime(item.uploaded_at)}`)} empty="No attachments uploaded." />
                </DocumentReportSection>

                <DocumentReportSection number="9" title="Workflow & Approval Journey" last>
                  <ReportKeyValueGrid rows={[
                    ['Department Head', request.department_head_name || 'Not assigned'],
                    ['IT Head', request.it_head_name || 'Not assigned'],
                    ['Project Manager', request.project_manager_name || 'Not assigned'],
                    ['Pending With', getPendingWithName(request)],
                  ]} />
                  <ReportTimeline events={timeline} />
                </DocumentReportSection>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, md: 3 }, py: 1.6, bgcolor: (theme) => theme.custom.semantic.elevated, borderTop: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', display: { xs: 'none', sm: 'block' } }}>
          Review the report evidence before downloading the official record.
        </Typography>
        <Button color="inherit" onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => downloadRequestReportPdf({ request, attachments, timeline, tasks, generatedBy })} sx={{ color: '#FFFFFF' }}>
          {isFinalReport ? 'Download Final ISMS Report' : 'Download Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DocumentReportSection({ number, title, children, last = false }) {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 2.5, md: 3.5 },
        borderBottom: last ? 'none' : (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
      }}
    >
      <Box sx={{ mb: 2.25 }}>
        <Typography variant="h6" fontWeight={950} sx={{ lineHeight: 1.25 }}>
          <Box component="span" sx={{ color: 'primary.main', mr: 1 }}>{String(number).padStart(2, '0')}</Box>
          {title}
        </Typography>
        <Divider sx={{ mt: 1.2 }} />
      </Box>
      <Stack spacing={1.85}>
        {children}
      </Stack>
    </Box>
  );
}

function ReportKeyValueGrid({ rows }) {
  return (
    <Grid container spacing={1.1}>
      {rows.map(([label, value]) => (
        <Grid key={label} size={{ xs: 12, sm: 6 }}>
          <Box sx={{ py: 1.25, px: 1.45, borderRadius: 1.35, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
            <Box sx={{ mt: 0.3 }}>
              {typeof value === 'string' || typeof value === 'number' ? (
                <Typography variant="body2" fontWeight={760} sx={{ lineHeight: 1.75, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography>
              ) : value}
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

function ReportParagraph({ label, value }) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={900}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.65, lineHeight: 1.9, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

function ReportCallout({ title, children, tone = 'info' }) {
  const toneStyles = {
    info: { border: '#93C5FD', bg: 'rgba(37,99,235,0.07)' },
    success: { border: '#86EFAC', bg: 'rgba(22,163,74,0.08)' },
    warning: { border: '#FDE68A', bg: 'rgba(217,119,6,0.09)' },
    closure: { border: '#A5B4FC', bg: 'rgba(79,70,229,0.09)' },
  }[tone] || { border: '#93C5FD', bg: 'rgba(37,99,235,0.07)' };

  return (
    <Box sx={{ p: tone === 'closure' ? 2 : 1.55, borderRadius: tone === 'closure' ? 2 : 1.4, borderLeft: `${tone === 'closure' ? 5 : 4}px solid ${toneStyles.border}`, bgcolor: toneStyles.bg }}>
      <Typography variant="subtitle2" fontWeight={950}>{title}</Typography>
      <Typography variant="body2" sx={{ mt: 0.8, lineHeight: tone === 'closure' ? 2 : 1.85, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

function ReportBulletList({ title, items, empty }) {
  const list = items.length ? items : [empty];
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={900}>{title}</Typography>
      <Stack component="ul" spacing={1} sx={{ m: 0, mt: 0.9, pl: 2.5 }}>
        {list.map((item, index) => (
          <Typography key={`${title}-${index}`} component="li" variant="body2" sx={{ lineHeight: 1.85, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {item}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

function ReportTimeline({ events }) {
  const milestones = buildWorkflowMilestones(events);
  if (!milestones.length) {
    return <ReportCallout title="Workflow Journey">No workflow journey recorded.</ReportCallout>;
  }

  return (
    <Stack spacing={1.25}>
      {milestones.map((event, index) => (
        <Stack key={`${event.id}-${event.stageName}`} direction="row" spacing={1.4} sx={{ alignItems: 'stretch' }}>
          <Stack sx={{ alignItems: 'center', pt: 0.25 }}>
            <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#EFF6FF', color: 'primary.main', border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
              <CheckCircleIcon sx={{ fontSize: 15 }} />
            </Box>
            {index < milestones.length - 1 && <Box sx={{ width: 1, flex: 1, bgcolor: (theme) => theme.custom.semantic.borderSoft, my: 0.5 }} />}
          </Stack>
          <Box sx={{ flex: 1, p: 1.35, borderRadius: 1.5, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' } }}>
              <Typography variant="body2" fontWeight={900}>{event.stageName}</Typography>
              <Typography variant="caption" color="text.secondary">{formatFullDateTime(event.changed_at)}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>{event.changed_by_name || 'System'}</Typography>
            <Typography variant="body2" sx={{ mt: 0.7, lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {event.summaryComment || 'No comment recorded.'}
            </Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
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
    title: getTimelineActivityTitle(item),
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
              {item.comment && (
                <Box sx={{ mt: 0.55, p: 0.85, borderRadius: 1.25, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
                  <Typography variant="caption" color="text.primary" sx={{ display: 'block', lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{item.comment}</Typography>
                </Box>
              )}
              <Typography variant="caption" color="text.secondary">{item.actor} · {formatDateTime(item.date)}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </SidebarPanel>
  );
}

const sprintFormDefaults = {
  sprintName: '',
  goal: '',
  endDate: '',
  notes: '',
  assignedDeveloperUserId: '',
  status: 'PLANNED',
};

const sprintTaskFormDefaults = {
  userStoryId: '',
  title: '',
  description: '',
  assignedDeveloperUserId: '',
  priority: 'MEDIUM',
  assignmentMode: 'SPRINT',
};

function getFutureDateInputMin() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function isFutureDateInput(value) {
  return Boolean(value) && value >= getFutureDateInputMin();
}

function getDueDateState(dueDate, status) {
  if (!dueDate) return { tone: 'neutral', label: 'No due date', dateLabel: 'Not set' };
  const terminal = ['DONE', 'CANCELLED'].includes(status);
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { tone: 'neutral', label: 'No due date', dateLabel: 'Not set' };
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (!terminal && daysLeft < 0) return { tone: 'danger', label: `Overdue by ${Math.abs(daysLeft)}d`, dateLabel: formatDate(dueDate) };
  if (!terminal && daysLeft === 0) return { tone: 'danger', label: 'Due today', dateLabel: formatDate(dueDate) };
  if (!terminal && daysLeft <= 2) return { tone: 'warning', label: `Due in ${daysLeft}d`, dateLabel: formatDate(dueDate) };
  return { tone: terminal ? 'success' : 'neutral', label: terminal ? 'Closed' : 'Due date', dateLabel: formatDate(dueDate) };
}

function DueDateBadge({ dueDate, status, compact = false }) {
  const state = getDueDateState(dueDate, status);
  const styles = {
    danger: { color: '#B91C1C', bgcolor: '#FEE2E2', borderColor: '#FCA5A5' },
    warning: { color: '#A16207', bgcolor: '#FEF3C7', borderColor: '#FDE68A' },
    success: { color: '#15803D', bgcolor: '#DCFCE7', borderColor: '#86EFAC' },
    neutral: { color: '#475569', bgcolor: '#F8FAFC', borderColor: '#CBD5E1' },
  }[state.tone];
  return (
    <Chip
      size="small"
      label={compact ? state.dateLabel : `${state.label} · ${state.dateLabel}`}
      sx={{
        color: styles.color,
        bgcolor: styles.bgcolor,
        border: `1px solid ${styles.borderColor}`,
        fontWeight: 850,
      }}
    />
  );
}

function DeveloperDeliveryReport({ user, scope, stories, sprints, tasks }) {
  const myTasks = tasks.filter((task) => Number(task.assigned_developer_user_id) === Number(user?.id));
  if (user?.roleCode !== 'DEVELOPER' || myTasks.length === 0) return null;

  return (
    <WorkspacePanel title="Developer Delivery Report" caption="Full requirements context for development">
      <Stack spacing={2}>
        <Alert severity="info">
          This report shows the full scope and all user stories for this request.
        </Alert>

        <PlanningSection title="Scope">
          {scope ? (
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" fontWeight={950}>{scope.scope_title || 'Project Scope'}</Typography>
                {scope.scope_description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>{scope.scope_description}</Typography>
                )}
              </Box>
              <Grid container spacing={1.25}>
                <DeveloperReportBlock title="Business Objectives" value={scope.business_objectives} wide />
                <DeveloperReportList title="In Scope" items={splitScopeItems(scope.in_scope)} tone="positive" />
                <DeveloperReportList title="Out Of Scope" items={splitScopeItems(scope.out_of_scope)} tone="negative" />
              </Grid>
            </Stack>
          ) : (
            <EmptyInline message="No scope document is available yet." />
          )}
        </PlanningSection>

        <PlanningSection title="User Stories" caption={`${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`}>
          {stories.length === 0 ? (
            <EmptyInline message="No user stories are available yet." />
          ) : (
            <Stack spacing={1.1}>
              {stories.map((story) => (
                <Box key={story.id} sx={{ p: 1.4, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.paper, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
                  <Stack spacing={0.8}>
                    <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip size="small" label={story.story_key || `US-${story.id}`} />
                      <StatusBadge value={story.priority} />
                      <StatusBadge value={story.status} />
                    </Stack>
                    <Typography variant="subtitle2" fontWeight={950}>{story.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{story.description}</Typography>
                    <Box sx={{ p: 1.15, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={850}>Acceptance Criteria</Typography>
                      <Typography variant="body2" sx={{ mt: 0.35, whiteSpace: 'pre-line' }}>{story.acceptance_criteria || 'Not provided'}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </PlanningSection>

      </Stack>
    </WorkspacePanel>
  );
}

function DeveloperReportBlock({ title, value, wide = false }) {
  return (
    <Grid size={wide ? { xs: 12 } : { xs: 12, md: 6 }}>
      <Box sx={{ p: 1.25, height: '100%', borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>{title}</Typography>
        <Typography variant="body2" sx={{ mt: 0.35, whiteSpace: 'pre-line' }}>{value || 'Not provided'}</Typography>
      </Box>
    </Grid>
  );
}

function DeveloperReportList({ title, items, tone }) {
  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Box sx={{ p: 1.25, height: '100%', borderRadius: 1.75, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>{title}</Typography>
        <Stack spacing={0.7} sx={{ mt: 0.9 }}>
          {items.length ? items.map((item, index) => (
            <ScopeListItem key={`${title}-${index}-${item}`} item={item} tone={tone} />
          )) : <Typography variant="body2" color="text.secondary">No items listed.</Typography>}
        </Stack>
      </Box>
    </Grid>
  );
}

function DeveloperTaskMeta({ label, value }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
        <Box sx={{ mt: 0.35 }}>
          {typeof value === 'string' ? <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography> : value}
        </Box>
      </Box>
    </Grid>
  );
}

function getTaskProgress(tasks = []) {
  const progressTasks = tasks.filter((task) => (
    (!task.sprint_status || ['ACTIVE', 'COMPLETED'].includes(task.sprint_status))
    && task.status !== 'CANCELLED'
  ));
  if (!progressTasks.length) return 0;
  const completed = progressTasks.filter((task) => task.status === 'DONE').length;
  return Math.round((completed / progressTasks.length) * 100);
}

function getSprintOwnerLabel(sprint, tasks = []) {
  if (sprint?.assigned_developer_user_id) {
    return sprint.assigned_developer_name || 'Sprint owner';
  }
  if (tasks.some((task) => task.assigned_developer_user_id)) return 'Multiple Developers';
  return 'No Developer Assigned';
}

function getSprintDeleteBlockReason(request, sprint, tasks = []) {
  const beyondPlanning = ['DEVELOPMENT_COMPLETE', 'QA_PENDING', 'IN_TESTING', 'QA_FAILED', 'QA_PASSED', 'UAT_PENDING', 'UAT_FAILED', 'UAT_APPROVED', 'DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION', 'CLOSED'].includes(request.status);
  if (beyondPlanning || sprint.status === 'COMPLETED' || tasks.some((task) => task.status === 'DONE')) {
    return 'This sprint cannot be deleted because work has already been completed or progressed beyond the planning stage.';
  }
  return '';
}

function sprintReadyReasons(tasks = []) {
  const reasons = [];
  if (!tasks.length) reasons.push('Add at least one task.');
  if (tasks.some((task) => !task.assigned_developer_user_id)) reasons.push('Assign every task to a developer.');
  return reasons;
}

function SprintPlanningPanel({ request, user, sprints, tasks, stories, developers, onRefresh, showToast, setError }) {
  const [sprintForm, setSprintForm] = useState(sprintFormDefaults);
  const [taskForm, setTaskForm] = useState(sprintTaskFormDefaults);
  const [sprintDialogOpen, setSprintDialogOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState({ open: false, sprint: null });
  const [assignDialog, setAssignDialog] = useState({ open: false, sprint: null, developerId: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, sprint: null, reason: '' });
  const [blockerDialog, setBlockerDialog] = useState({ open: false, sprint: null });
  const [blockerForm, setBlockerForm] = useState({ blockerTitle: '', description: '', severity: 'MEDIUM', additionalNotes: '' });
  const [boardTab, setBoardTab] = useState('sprints');
  const [blockerSolutions, setBlockerSolutions] = useState({});
  const [expandedSprint, setExpandedSprint] = useState('');
  const [busy, setBusy] = useState(false);
  const role = user?.roleCode;
  const isAdmin = role === 'SYSTEM_ADMIN';
  const canManageSprint = (role === 'PROJECT_MANAGER' || isAdmin) && ['REQUIREMENTS_APPROVED', 'SPRINT_PLANNING', 'SPRINT_CREATED', 'SPRINT_ACTIVE', 'IN_DEVELOPMENT'].includes(request.status);
  const shouldShow = ['REQUIREMENTS_APPROVED', 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', 'SPRINT_CREATED', 'SPRINT_ACTIVE', 'IN_DEVELOPMENT', 'DEVELOPMENT_COMPLETE', 'QA_PENDING', 'QA_FAILED', 'QA_PASSED'].includes(request.status)
    || sprints.length > 0
    || tasks.length > 0;
  const sortedSprints = useMemo(() => [...sprints].sort((a, b) => Number(a.id) - Number(b.id)), [sprints]);
  const tasksBySprint = useMemo(() => tasks.reduce((groups, task) => {
    const key = Number(task.sprint_id || 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
    return groups;
  }, new Map()), [tasks]);
  const myTasks = tasks.filter((task) => Number(task.assigned_developer_user_id) === Number(user?.id));
  const boardProgress = getTaskProgress(tasks);
  const blockedTasks = tasks.filter((task) => task.status === 'BLOCKED');

  useEffect(() => {
    if (!expandedSprint && sortedSprints[0]?.id) {
      setExpandedSprint(String(sortedSprints[0].id));
    }
  }, [expandedSprint, sortedSprints]);

  if (!shouldShow) return null;

  function openTaskDialog(sprint) {
    const ownerId = sprint.assigned_developer_user_id || '';
    setTaskDialog({ open: true, sprint });
    setTaskForm({
      ...sprintTaskFormDefaults,
      assignmentMode: ownerId ? 'SPRINT' : 'TASK',
      assignedDeveloperUserId: ownerId,
    });
  }

  function closeTaskDialog() {
    setTaskDialog({ open: false, sprint: null });
    setTaskForm(sprintTaskFormDefaults);
  }

  async function createSprint() {
    if (sprintForm.sprintName.trim().length < 2) return;
    if (!isFutureDateInput(sprintForm.endDate)) {
      setError('Sprint due date must be after today.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints`, {
        sprintName: sprintForm.sprintName,
        goal: sprintForm.goal || null,
        endDate: sprintForm.endDate || null,
        notes: sprintForm.notes || null,
        assignedDeveloperUserId: sprintForm.assignedDeveloperUserId ? Number(sprintForm.assignedDeveloperUserId) : null,
        status: 'PLANNED',
      });
      setSprintForm(sprintFormDefaults);
      setSprintDialogOpen(false);
      showToast('Sprint created.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createTask() {
    const sprint = taskDialog.sprint;
    if (!sprint || taskForm.title.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/tasks`, {
        title: taskForm.title,
        description: taskForm.description || null,
        priority: taskForm.priority,
        userStoryId: taskForm.userStoryId ? Number(taskForm.userStoryId) : null,
        assignedDeveloperUserId: sprint.assigned_developer_user_id
          ? Number(sprint.assigned_developer_user_id)
          : taskForm.assignedDeveloperUserId ? Number(taskForm.assignedDeveloperUserId) : null,
        status: 'TODO',
      });
      closeTaskDialog();
      showToast('Task added to sprint.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignSprintDeveloper() {
    const sprint = assignDialog.sprint;
    const developerId = assignDialog.developerId;
    if (!sprint || !developerId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/assign-developer`, { developerUserId: Number(developerId) });
      setAssignDialog({ open: false, sprint: null, developerId: '' });
      showToast('Sprint assigned to developer.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignTaskDeveloper(task, developerId) {
    if (!developerId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${task.sprint_id}/tasks/${task.id}/assign-developer`, { developerUserId: Number(developerId) });
      showToast('Task developer updated.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startSprint(sprint) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/start`, { comment: 'Sprint started from Sprint Board.' });
      showToast('Sprint started.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeSprint(sprint) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/complete`, { comment: 'Sprint completed from Sprint Board.' });
      showToast('Sprint completed.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopSprint(sprint) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/stop`, { comment: 'Sprint stopped from Sprint Board.' });
      showToast('Sprint stopped. Developer notified.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openDeleteDialog(sprint) {
    const sprintTasks = tasksBySprint.get(Number(sprint.id)) || [];
    setDeleteDialog({ open: true, sprint, reason: getSprintDeleteBlockReason(request, sprint, sprintTasks) });
  }

  async function deleteSprint() {
    const sprint = deleteDialog.sprint;
    if (!sprint || deleteDialog.reason) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/requests/${request.id}/sprints/${sprint.id}`);
      setDeleteDialog({ open: false, sprint: null, reason: '' });
      showToast('Sprint deleted.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(task) {
    const reopening = task.status === 'DONE';
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${task.sprint_id}/tasks/${task.id}/status`, {
        status: reopening ? 'TODO' : 'DONE',
        progressPercentage: reopening ? 0 : 100,
        comment: reopening ? 'Task reopened from My Sprints.' : 'Task completed from My Sprints.',
      });
      showToast(reopening ? 'Task marked incomplete.' : 'Task completed.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openBlockerDialog(sprint) {
    setBlockerDialog({ open: true, sprint });
    setBlockerForm({ blockerTitle: '', description: '', severity: 'MEDIUM', additionalNotes: '' });
  }

  async function submitBlocker() {
    const sprint = blockerDialog.sprint;
    if (!sprint || blockerForm.blockerTitle.trim().length < 3 || blockerForm.description.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${sprint.id}/blocker`, blockerForm);
      setBlockerDialog({ open: false, sprint: null });
      showToast('Blocker raised and Project Manager notified.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveBlocker(task) {
    const solution = (blockerSolutions[task.id] || '').trim();
    if (solution.length < 3) {
      setError('Add a solution message before unblocking this task.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/requests/${request.id}/sprints/${task.sprint_id}/tasks/${task.id}/resolve-blocker`, { comment: solution });
      setBlockerSolutions((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      showToast('Blocker solution sent. Task unblocked.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (role === 'DEVELOPER') {
    return (
      <MySprintsPanel
        request={request}
        user={user}
        sprints={sortedSprints}
        tasks={myTasks}
        busy={busy}
        expandedSprint={expandedSprint}
        setExpandedSprint={setExpandedSprint}
        onCompleteTask={completeTask}
        onRaiseBlocker={openBlockerDialog}
        blockerDialog={blockerDialog}
        blockerForm={blockerForm}
        setBlockerForm={setBlockerForm}
        onCloseBlocker={() => setBlockerDialog({ open: false, sprint: null })}
        onSubmitBlocker={submitBlocker}
      />
    );
  }

  return (
    <WorkspacePanel
      title="Sprint Board"
      caption="Clean execution workspace for sprint delivery"
      action={canManageSprint && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSprintDialogOpen(true)}>Create Sprint</Button>}
    >
      <Stack spacing={2.25}>
        <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: (theme) => theme.custom.semantic.paperSoft, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={900}>Current Progress</Typography>
              <Typography variant="h4" fontWeight={950}>{boardProgress}%</Typography>
              <Typography variant="body2" color="text.secondary">Completed active sprint tasks / active sprint tasks</Typography>
            </Box>
            <Box sx={{ width: { xs: '100%', md: 360 } }}>
              <LinearProgress variant="determinate" value={boardProgress} sx={{ height: 12, borderRadius: 999, '& .MuiLinearProgress-bar': { borderRadius: 999 } }} />
            </Box>
          </Stack>
        </Box>

        {canManageSprint && (
          <Tabs value={boardTab} onChange={(_, value) => setBoardTab(value)} sx={{ minHeight: 40 }}>
            <Tab value="sprints" label="Sprints" />
            <Tab value="blockers" label={`Show Blockers (${blockedTasks.length})`} />
          </Tabs>
        )}

        {canManageSprint && boardTab === 'blockers' ? (
          <SprintBlockersPanel
            blockers={blockedTasks}
            blockerSolutions={blockerSolutions}
            setBlockerSolutions={setBlockerSolutions}
            onResolve={resolveBlocker}
            busy={busy}
          />
        ) : sortedSprints.length === 0 ? (
          <EmptyInline message={canManageSprint ? 'No sprints yet. Create a sprint to start delivery planning.' : 'No sprints have been created yet.'} />
        ) : (
          <Stack spacing={1.5}>
            {sortedSprints.map((sprint, index) => {
              const sprintTasks = tasksBySprint.get(Number(sprint.id)) || [];
              return (
                <SprintBoardCard
                  key={sprint.id}
                  sprint={sprint}
                  sprintNumber={index + 1}
                  tasks={sprintTasks}
                  stories={stories}
                  developers={developers}
                  expanded={expandedSprint === String(sprint.id)}
                  onToggle={() => setExpandedSprint(expandedSprint === String(sprint.id) ? '' : String(sprint.id))}
                  canManage={canManageSprint}
                  busy={busy}
                  onAddTask={openTaskDialog}
                  onAssignSprint={(targetSprint) => setAssignDialog({ open: true, sprint: targetSprint, developerId: targetSprint.assigned_developer_user_id || '' })}
                  onAssignTask={assignTaskDeveloper}
                  onStart={startSprint}
                  onStop={stopSprint}
                  onComplete={completeSprint}
                  onDelete={openDeleteDialog}
                />
              );
            })}
          </Stack>
        )}
      </Stack>

      <SprintCreateDialog
        open={sprintDialogOpen}
        form={sprintForm}
        setForm={setSprintForm}
        developers={developers}
        busy={busy}
        onClose={() => setSprintDialogOpen(false)}
        onSubmit={createSprint}
      />
      <SprintTaskCreateDialog
        open={taskDialog.open}
        sprint={taskDialog.sprint}
        form={taskForm}
        setForm={setTaskForm}
        developers={developers}
        stories={stories}
        busy={busy}
        sprintDeveloper={taskDialog.sprint?.assigned_developer_user_id ? { id: taskDialog.sprint.assigned_developer_user_id, name: taskDialog.sprint.assigned_developer_name || 'Sprint owner' } : null}
        onClose={closeTaskDialog}
        onSubmit={createTask}
      />
      <SprintAssignDialog
        open={assignDialog.open}
        sprint={assignDialog.sprint}
        developerId={assignDialog.developerId}
        setDeveloperId={(developerId) => setAssignDialog((current) => ({ ...current, developerId }))}
        developers={developers}
        busy={busy}
        onClose={() => setAssignDialog({ open: false, sprint: null, developerId: '' })}
        onSubmit={assignSprintDeveloper}
      />
      <SprintDeleteDialog
        open={deleteDialog.open}
        sprint={deleteDialog.sprint}
        reason={deleteDialog.reason}
        busy={busy}
        onClose={() => setDeleteDialog({ open: false, sprint: null, reason: '' })}
        onSubmit={deleteSprint}
      />
    </WorkspacePanel>
  );
}

function SprintBlockersPanel({ blockers, blockerSolutions, setBlockerSolutions, onResolve, busy }) {
  if (!blockers.length) {
    return <EmptyInline message="No active blockers. Blocked sprint work will appear here for PM resolution." />;
  }

  return (
    <Stack spacing={1.25}>
      {blockers.map((task) => (
        <Box
          key={task.id}
          sx={{
            p: 1.5,
            borderRadius: 2.25,
            border: (theme) => `1px solid ${theme.palette.warning.light}`,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(251,191,36,0.08)' : '#FFFBEB',
          }}
        >
          <Stack spacing={1.1}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="warning.main" fontWeight={950}>
                  {task.sprint_name || 'Sprint'} · {task.task_key || `TASK-${task.id}`}
                </Typography>
                <Typography variant="subtitle2" fontWeight={950} sx={{ mt: 0.25 }}>
                  {task.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                  Assigned Developer: {task.assigned_developer_name || 'Unassigned'}
                </Typography>
              </Box>
              <StatusBadge value="BLOCKED" />
            </Stack>

            {task.blocked_reason && (
              <Box sx={{ p: 1.15, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paper }}>
                <Typography variant="caption" color="text.secondary" fontWeight={900}>Blocker Details</Typography>
                <Typography variant="body2" sx={{ mt: 0.45, whiteSpace: 'pre-line' }}>{task.blocked_reason}</Typography>
              </Box>
            )}

            <TextField
              label="PM Solution / Unblocker Message"
              value={blockerSolutions[task.id] || ''}
              onChange={(event) => setBlockerSolutions((current) => ({ ...current, [task.id]: event.target.value }))}
              placeholder="Explain the solution, decision, workaround, or next step for the developer."
              multiline
              minRows={3}
              fullWidth
            />
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                color="success"
                disabled={busy || (blockerSolutions[task.id] || '').trim().length < 3}
                onClick={() => onResolve(task)}
              >
                Send Solution & Unblock
              </Button>
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function SprintBoardCard({ sprint, sprintNumber, tasks, stories, developers, expanded, onToggle, canManage, busy, onAddTask, onAssignSprint, onAssignTask, onStart, onStop, onComplete, onDelete }) {
  const progress = getTaskProgress(tasks);
  const readyReasons = sprintReadyReasons(tasks);
  const allDone = tasks.length > 0 && tasks.every((task) => task.status === 'DONE');
  const canAddTask = canManage && !['COMPLETED', 'CANCELLED'].includes(sprint.status);
  const canStart = canManage && ['PLANNED', 'CREATED'].includes(sprint.status) && readyReasons.length === 0;
  const canStop = canManage && ['ACTIVE', 'BLOCKED'].includes(sprint.status);
  const canComplete = canManage && allDone && !['COMPLETED', 'CANCELLED'].includes(sprint.status);
  const hasSprintOwner = Boolean(sprint.assigned_developer_user_id);

  return (
    <Accordion expanded={expanded} onChange={onToggle} disableGutters sx={{ borderRadius: '18px !important', border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper, boxShadow: 'none', overflow: 'hidden', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack spacing={1.25} sx={{ width: '100%', pr: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.8} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h6" fontWeight={950}>{sprint.sprint_name || `Sprint ${sprintNumber}`}</Typography>
                <StatusBadge value={sprint.status} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                Owner: {getSprintOwnerLabel(sprint, tasks)} · Due: {formatDate(sprint.end_date)} · Tasks: {tasks.length}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} onClick={(event) => event.stopPropagation()}>
              {canStart && <Button size="small" variant="contained" disabled={busy} onClick={() => onStart(sprint)} startIcon={<PlayCircle size={17} />}>Start Sprint</Button>}
              {canManage && <Button size="small" variant="text" onClick={() => onAssignSprint(sprint)}>Assign Sprint</Button>}
              {canManage && <Button size="small" color="error" variant="text" onClick={() => onDelete(sprint)}>Delete Sprint</Button>}
            </Stack>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: { sm: 'center' } }}>
            <LinearProgress variant="determinate" value={progress} sx={{ flex: 1, height: 8, borderRadius: 999, '& .MuiLinearProgress-bar': { borderRadius: 999 } }} />
            <Typography variant="caption" color="text.secondary" fontWeight={900}>Progress: {progress}%</Typography>
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          {(sprint.goal || sprint.notes) && (
            <Box sx={{ p: 1.4, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
              {sprint.goal && <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}><strong>Goal:</strong> {sprint.goal}</Typography>}
              {sprint.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: sprint.goal ? 0.8 : 0, whiteSpace: 'pre-line' }}>{sprint.notes}</Typography>}
            </Box>
          )}

          {canManage && readyReasons.length > 0 && ['PLANNED', 'CREATED'].includes(sprint.status) && (
            <Alert severity="info">{readyReasons.join(' ')}</Alert>
          )}

          {tasks.length === 0 ? (
            <EmptyInline message="No tasks in this sprint yet." />
          ) : (
            <Stack spacing={0.8}>
              {tasks.map((task) => (
                <SprintTaskTodoItem
                  key={task.id}
                  task={task}
                  stories={stories}
                  developers={developers}
                  canManage={canManage}
                  disableTaskAssignment={hasSprintOwner}
                  onAssignTask={onAssignTask}
                />
              ))}
            </Stack>
          )}

          {canManage && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              {canAddTask && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => onAddTask(sprint)}>Add Task</Button>}
              {canStop && <Button variant="outlined" color="warning" disabled={busy} onClick={() => onStop(sprint)} startIcon={<PauseCircle size={17} />}>Stop Sprint</Button>}
              {canComplete && <Button variant="outlined" color="success" disabled={busy} onClick={() => onComplete(sprint)} startIcon={<CheckCircle2 size={17} />}>Complete Sprint</Button>}
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function SprintTaskTodoItem({ task, stories, developers, canManage, disableTaskAssignment = false, onAssignTask, canComplete = false, onCompleteTask }) {
  const linkedStory = stories.find((story) => Number(story.id) === Number(task.user_story_id));
  const done = task.status === 'DONE';
  return (
    <Box sx={{ p: 1.1, borderRadius: 2, bgcolor: (theme) => theme.custom.semantic.elevated, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
          <Checkbox checked={done} disabled={!canComplete} onChange={() => onCompleteTask?.(task)} sx={{ p: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={900} sx={{ textDecoration: done ? 'line-through' : 'none' }}>{task.title}</Typography>
            {task.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2, whiteSpace: 'pre-line' }}>{task.description}</Typography>}
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 0.7 }}>
              <StatusBadge value={task.priority} />
              <StatusBadge value={task.status} />
              <Typography variant="caption" color="text.secondary">Owner: {task.assigned_developer_name || 'Unassigned'}</Typography>
              {linkedStory && <Typography variant="caption" color="text.secondary">Story: {linkedStory.story_key || `US-${linkedStory.id}`}</Typography>}
            </Stack>
            {task.blocked_reason && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5, whiteSpace: 'pre-line' }}>{task.blocked_reason}</Typography>}
          </Box>
        </Stack>
        {canManage && !disableTaskAssignment && (
          <TextField
            select
            size="small"
            label="Developer"
            value={task.assigned_developer_user_id || ''}
            onChange={(event) => onAssignTask(task, event.target.value)}
            sx={{ minWidth: { xs: '100%', md: 220 } }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {developers.map((developer) => <MenuItem key={developer.id} value={developer.id}>{developer.full_name}</MenuItem>)}
          </TextField>
        )}
        {canManage && disableTaskAssignment && (
          <Typography variant="caption" color="text.secondary" fontWeight={850}>
            Inherits sprint owner
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function MySprintsPanel({ request, user, sprints, tasks, busy, expandedSprint, setExpandedSprint, onCompleteTask, onRaiseBlocker, blockerDialog, blockerForm, setBlockerForm, onCloseBlocker, onSubmitBlocker }) {
  const tasksBySprint = tasks.reduce((groups, task) => {
    const key = Number(task.sprint_id || 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
    return groups;
  }, new Map());
  const visibleSprints = sprints.filter((sprint) => Number(sprint.assigned_developer_user_id || 0) === Number(user?.id) || tasksBySprint.has(Number(sprint.id)));

  return (
    <WorkspacePanel title="My Sprints" caption="Your assigned sprint work">
      <Stack spacing={1.5}>
        {visibleSprints.length === 0 ? (
          <EmptyInline message="No sprints are assigned to you yet." />
        ) : visibleSprints.map((sprint) => {
          const sprintTasks = tasksBySprint.get(Number(sprint.id)) || [];
          const progress = getTaskProgress(sprintTasks);
          return (
            <Accordion key={sprint.id} expanded={expandedSprint === String(sprint.id)} onChange={() => setExpandedSprint(expandedSprint === String(sprint.id) ? '' : String(sprint.id))} disableGutters sx={{ borderRadius: '18px !important', border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, boxShadow: 'none', overflow: 'hidden', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack spacing={1} sx={{ width: '100%', pr: 1 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={950}>{sprint.sprint_name}</Typography>
                      <Typography variant="body2" color="text.secondary">Due: {formatDate(sprint.end_date)} · {sprintTasks.length} tasks</Typography>
                    </Box>
                    <StatusBadge value={sprint.status} />
                  </Stack>
                  <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 999, '& .MuiLinearProgress-bar': { borderRadius: 999 } }} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.2}>
                  <Stack spacing={0.8}>
                    {sprintTasks.length ? sprintTasks.map((task) => (
                      <SprintTaskTodoItem
                        key={task.id}
                        task={task}
                        stories={[]}
                        developers={[]}
                        canComplete={request.status !== 'CLOSED' && ['ACTIVE', 'BLOCKED', 'COMPLETED'].includes(task.sprint_status) && !busy}
                        onCompleteTask={onCompleteTask}
                      />
                    )) : <EmptyInline message="No tasks have been added to this sprint yet." />}
                  </Stack>
                  {!['COMPLETED', 'CANCELLED'].includes(sprint.status) && (
                    <Button variant="outlined" color="warning" sx={{ alignSelf: 'flex-start' }} onClick={() => onRaiseBlocker(sprint)} startIcon={<PauseCircle size={16} />}>
                      Raise Blocker
                    </Button>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
      <SprintBlockerDialog
        open={blockerDialog.open}
        sprint={blockerDialog.sprint}
        form={blockerForm}
        setForm={setBlockerForm}
        onClose={onCloseBlocker}
        onSubmit={onSubmitBlocker}
      />
    </WorkspacePanel>
  );
}

function SprintCreateDialog({ open, form, setForm, developers, busy, onClose, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Sprint</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField label="Sprint Name" value={form.sprintName} onChange={(event) => setForm((current) => ({ ...current, sprintName: event.target.value }))} required fullWidth />
          <TextField label="Sprint Goal" value={form.goal} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} multiline minRows={3} fullWidth />
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ display: 'block', mb: 0.65 }}>
              Sprint Due Date
            </Typography>
            <TextField
              type="date"
              value={form.endDate}
              onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              inputProps={{ min: getFutureDateInputMin(), 'aria-label': 'Sprint Due Date' }}
              helperText="Select a due date after today."
              required
              fullWidth
            />
          </Box>
          <TextField select label="Assigned Developer" value={form.assignedDeveloperUserId} onChange={(event) => setForm((current) => ({ ...current, assignedDeveloperUserId: event.target.value }))} fullWidth>
            <MenuItem value="">No Developer Assigned</MenuItem>
            {developers.map((developer) => <MenuItem key={developer.id} value={developer.id}>{developer.full_name}</MenuItem>)}
          </TextField>
          {form.assignedDeveloperUserId && (
            <Alert severity="info">
              Sprint Owner Selected. All tasks created inside this sprint will automatically be assigned to the selected developer. Task-level developer assignment will be disabled for this sprint. To assign tasks to multiple developers, leave Sprint Owner empty.
            </Alert>
          )}
          <TextField label="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} multiline minRows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit} disabled={busy || form.sprintName.trim().length < 2}>Create Sprint</Button>
      </DialogActions>
    </Dialog>
  );
}

function SprintTaskCreateDialog({ open, sprint, form, setForm, developers, stories, busy, sprintDeveloper, onClose, onSubmit }) {
  const selectedDeveloper = form.assignmentMode === 'SPRINT' ? sprintDeveloper?.id || '' : form.assignedDeveloperUserId;
  useEffect(() => {
    if (open && form.assignmentMode === 'SPRINT') {
      setForm((current) => ({ ...current, assignedDeveloperUserId: sprintDeveloper?.id || '' }));
    }
  }, [open, form.assignmentMode, sprintDeveloper?.id, setForm]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Add Task</Typography>
        <Typography variant="body2" color="text.secondary">{sprint?.sprint_name || 'Sprint'}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField label="Task Title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required fullWidth />
          <TextField label="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} multiline minRows={3} fullWidth />
          <TextField select label="Priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} fullWidth>
            {priorities.map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
          </TextField>
          {sprintDeveloper ? (
            <Alert severity="info">
              This sprint is owned by {sprintDeveloper.name}. New tasks will automatically be assigned to this developer.
            </Alert>
          ) : (
            <TextField select label="Assigned Developer" value={selectedDeveloper} onChange={(event) => setForm((current) => ({ ...current, assignedDeveloperUserId: event.target.value, assignmentMode: 'TASK' }))} fullWidth>
              <MenuItem value="">Assign later</MenuItem>
              {developers.map((developer) => <MenuItem key={developer.id} value={developer.id}>{developer.full_name}</MenuItem>)}
            </TextField>
          )}
          <TextField select label="Related User Story" value={form.userStoryId} onChange={(event) => setForm((current) => ({ ...current, userStoryId: event.target.value }))} fullWidth>
            <MenuItem value="">No story link</MenuItem>
            {stories.map((story) => <MenuItem key={story.id} value={story.id}>{story.story_key || `US-${story.id}`} · {story.title}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit} disabled={busy || form.title.trim().length < 3}>Add Task</Button>
      </DialogActions>
    </Dialog>
  );
}

function SprintAssignDialog({ open, sprint, developerId, setDeveloperId, developers, busy, onClose, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign Sprint</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            This makes the selected developer the sprint owner. All existing and future tasks in {sprint?.sprint_name || 'this sprint'} will belong to this developer, and task-level assignment will be disabled.
          </Typography>
          <TextField select label="Developer" value={developerId} onChange={(event) => setDeveloperId(event.target.value)} fullWidth>
            <MenuItem value="">Select developer</MenuItem>
            {developers.map((developer) => <MenuItem key={developer.id} value={developer.id}>{developer.full_name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit} disabled={busy || !developerId}>Assign Sprint</Button>
      </DialogActions>
    </Dialog>
  );
}

function SprintDeleteDialog({ open, sprint, reason, busy, onClose, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Sprint</DialogTitle>
      <DialogContent dividers>
        {reason ? (
          <Alert severity="warning">{reason}</Alert>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              This will permanently remove {sprint?.sprint_name || 'the sprint'} and all associated tasks.
            </Typography>
            <Typography variant="body2" fontWeight={900}>
              This action cannot be undone.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        {!reason && (
          <Button variant="contained" color="error" onClick={onSubmit} disabled={busy}>Delete Sprint</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function SprintBlockerDialog({ open, sprint, form, setForm, onClose, onSubmit }) {
  const disabled = form.blockerTitle.trim().length < 3 || form.description.trim().length < 3;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Raise Blocker</Typography>
        <Typography variant="body2" color="text.secondary">{sprint?.sprint_name || 'Sprint'}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField label="Blocker Title" value={form.blockerTitle} onChange={(event) => setForm((current) => ({ ...current, blockerTitle: event.target.value }))} required fullWidth />
          <TextField label="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} multiline minRows={3} required fullWidth />
          <TextField select label="Severity" value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))} fullWidth>
            {priorities.map((severity) => <MenuItem key={severity} value={severity}>{formatEnum(severity)}</MenuItem>)}
          </TextField>
          <TextField label="Additional Notes" value={form.additionalNotes} onChange={(event) => setForm((current) => ({ ...current, additionalNotes: event.target.value }))} multiline minRows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onSubmit} disabled={disabled}>Raise Blocker</Button>
      </DialogActions>
    </Dialog>
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
    setError,
    runAction,
    review,
    setReview,
    assignment,
    setAssignment,
    projectManagers,
    developers,
    workloadByDeveloper,
    qaUsers,
    testResult,
    setTestResult,
    tasks = [],
    latestRequesterUpdate,
    clarifications = [],
    attachments = [],
    timeline = [],
    navigate,
    showToast,
    preselectedActionId = '',
  } = props;
  const role = user?.roleCode;
  const isAdmin = role === 'SYSTEM_ADMIN';
  const canDepartmentApprove = request.status === 'DEPARTMENT_APPROVAL_PENDING' && (role === 'DEPARTMENT_HEAD' || isAdmin);
  const canRespondClarification = request.status === 'CLARIFICATION_REQUESTED' && Number(request.requester_user_id) === Number(user?.id);
  const canReviewIt = request.status === 'IT_REVIEW_PENDING' && (role === 'IT_HEAD' || isAdmin);
  const canResumeDeferred = request.status === 'DEFERRED' && (role === 'IT_HEAD' || isAdmin);
  const canAssignProjectManager = ['ASSIGNMENT_PENDING', 'PM_ASSIGNED'].includes(request.status) && (role === 'IT_HEAD' || isAdmin);
  const hasActiveAssignment = Boolean(request.active_assignment_id);
  const canAssign = false;
  const canStartDevelopment = false;
  const developerReviewTasks = tasks.filter((task) => (
    Number(task.assigned_developer_user_id) === Number(user?.id)
    && (!task.sprint_status || ['ACTIVE', 'COMPLETED'].includes(task.sprint_status))
    && task.status !== 'CANCELLED'
  ));
  const developerAssignedWorkComplete = developerReviewTasks.length > 0
    && developerReviewTasks.every((task) => task.status === 'DONE');
  const canSubmitDevelopmentForReview = request.status === 'IN_DEVELOPMENT'
    && ((role === 'DEVELOPER' && developerAssignedWorkComplete) || (isAdmin && Number(request.progress_percentage || 0) >= 100));
  const canSubmitForQa = request.status === 'DEVELOPMENT_COMPLETE' && (role === 'PROJECT_MANAGER' || isAdmin);
  const canSendQaReworkToDeveloper = request.status === 'QA_FAILED' && (role === 'PROJECT_MANAGER' || isAdmin);
  const canSendToRequesterTesting = request.status === 'QA_PASSED' && (role === 'PROJECT_MANAGER' || isAdmin);
  const canTest = request.status === 'QA_PENDING'
    && (role === 'QA' || isAdmin)
    && (isAdmin || Number(request.active_qa_user_id || 0) === Number(user?.id || 0));
  const canUat = request.status === 'UAT_PENDING'
    && (isAdmin || Number(request.requester_user_id || 0) === Number(user?.id || 0));
  const canManagePlanning = ['PM_ASSIGNED', 'REQUIREMENTS_CLARIFICATION_REQUESTED'].includes(request.status) && (role === 'PROJECT_MANAGER' || isAdmin);
  const canCompleteDeployment = ['UAT_APPROVED', 'DEPLOYMENT_PENDING'].includes(request.status) && (role === 'PROJECT_MANAGER' || isAdmin);
  const canRequesterComplete = request.status === 'READY_FOR_COMPLETION'
    && (isAdmin || Number(request.requester_user_id) === Number(user?.id));
  const canCloseRequest = request.status === 'DEPLOYED' && (role === 'PROJECT_MANAGER' || role === 'IT_HEAD' || isAdmin);
  const canWithdrawRequest = Number(request.requester_user_id) === Number(user?.id)
    && !terminalRequestStatuses.includes(request.status);
  const hasActions = canDepartmentApprove || canRespondClarification || canReviewIt || canResumeDeferred || canAssignProjectManager || canManagePlanning || canAssign || canStartDevelopment || canSubmitDevelopmentForReview || canSubmitForQa || canSendQaReworkToDeveloper || canSendToRequesterTesting || canTest || canUat || canCompleteDeployment || canRequesterComplete || canCloseRequest || canWithdrawRequest;
  const [selectedActionId, setSelectedActionId] = useState('');
  const [clarificationDetails, setClarificationDetails] = useState({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
  const [qaReworkTasks, setQaReworkTasks] = useState([{ title: '', description: '', priority: 'HIGH' }]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const defaultActionId = preselectedActionId || (canReviewIt ? 'it-approve' : '');
    setSelectedActionId(defaultActionId);
    setActionComment('');
    setClarificationDetails({ reasonCategory: 'MISSING_REQUIREMENTS', note: '' });
    setQaReworkTasks([{ title: '', description: '', priority: 'HIGH' }]);
    if (preselectedActionId === 'qa-pass') {
      setTestResult((current) => ({ ...current, result: 'PASS' }));
    } else if (preselectedActionId === 'qa-fail') {
      setTestResult((current) => ({ ...current, result: 'FAIL' }));
    }
    if (request.active_assignment_id) {
      setAssignment({
        developerUserId: request.active_developer_user_id || '',
        qaUserId: request.active_qa_user_id || '',
        notes: '',
      });
    } else if (['ASSIGNMENT_PENDING', 'PM_ASSIGNED', 'REQUIREMENTS_APPROVED'].includes(request.status)) {
      setAssignment({
        developerUserId: '',
        qaUserId: '',
        projectManagerUserId: request.project_manager_user_id || '',
        notes: '',
      });
    }
  }, [request.id, request.status, request.project_manager_user_id, request.active_assignment_id, request.active_developer_user_id, request.active_qa_user_id, preselectedActionId, canReviewIt, setActionComment, setAssignment, setTestResult]);

  if (!hasActions && !preselectedActionId) {
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
  const requesterTestingNote = [...timeline].reverse().find((item) => item.to_status === 'UAT_PENDING' && item.comment)?.comment || '';

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
          'Internal Review Approved Successfully. Project Manager assignment is now required.',
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

  if (canResumeDeferred) {
    actionGroups.push({
      id: 'it-resume',
      label: 'Resume Deferred Request',
      description: 'Reopen this request and return it to IT review',
      tone: 'success',
      icon: PlayCircle,
      submitLabel: 'Resume Request',
      onSubmit: () => runAction('/it-review/resume', { comment: actionComment }),
    });
  }

  if (canAssignProjectManager) {
    actionGroups.push({
      id: 'assign-project-manager',
      label: request.project_manager_user_id ? 'Change Project Manager' : 'Assign Project Manager',
      description: 'Select the Project Manager who will define scope and delivery plan',
      tone: 'success',
      icon: Send,
      assignment: true,
      assignmentMode: 'project-manager',
      submitLabel: request.project_manager_user_id ? 'Update Project Manager' : 'Assign Project Manager',
      onSubmit: () => runAction(
        '/project-manager/assign',
        {
          projectManagerUserId: assignment.projectManagerUserId,
          notes: assignment.notes,
        },
        request.project_manager_user_id
          ? 'Project Manager updated successfully.'
          : 'Project Manager assigned successfully. Request is ready for scope definition.',
      ),
    });
  }

  if (canManagePlanning) {
    actionGroups.push(
      {
        id: 'open-scope-management',
        label: 'Create / Edit Scope',
        description: 'Define in scope, out of scope, and objectives',
        tone: 'neutral',
        icon: Send,
        submitLabel: 'Open Scope Management',
        onSubmit: () => navigate('/project-scopes'),
      },
      {
        id: 'open-story-management',
        label: 'Create / Edit User Stories',
        description: 'Prepare acceptance criteria and priorities for Department HOD review',
        tone: 'neutral',
        icon: Send,
        submitLabel: 'Open User Story Management',
        onSubmit: () => navigate('/user-stories'),
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

  if (canSubmitDevelopmentForReview) {
    actionGroups.push({
      id: 'submit-development-review',
      label: 'Submit For Review',
      description: 'Send your completed assigned work to the Project Manager',
      tone: 'success',
      icon: CheckCircle2,
      submitLabel: 'Submit For Review',
      helper: role === 'DEVELOPER'
        ? 'All of your assigned active sprint tasks are complete. This will notify the Project Manager for review.'
        : 'All active sprint tasks are complete. This will route the request back to the Project Manager.',
      onSubmit: () => runAction('/development/submit-for-review', { comment: actionComment }),
    });
  }

  if (canSubmitForQa) {
    actionGroups.push({
      id: 'submit-for-qa',
      label: 'Submit For QA',
      description: 'Select a QA engineer and route completed development for testing',
      tone: 'success',
      icon: CheckCircle2,
      qaSubmit: true,
      submitLabel: 'Submit For QA',
      onSubmit: () => runAction(
        '/qa/submit',
        { qaUserId: assignment.qaUserId, comment: actionComment },
        'Submitted for QA. QA ownership has started.',
      ),
    });
  }

  if (canSendQaReworkToDeveloper) {
    actionGroups.push({
      id: 'send-qa-rework',
      label: 'Send Back To Developer',
      description: 'Route QA comments back to the assigned developer for fixes',
      tone: 'warning',
      icon: Send,
      reworkTasks: true,
      submitLabel: 'Send Back To Developer',
      onSubmit: () => runAction('/qa/send-to-developer', {
        comment: actionComment,
        tasks: qaReworkTasks
          .map((task) => ({
            title: task.title.trim(),
            description: task.description.trim() || null,
            priority: task.priority,
          }))
          .filter((task) => task.title.length >= 3),
      }),
    });
  }

  if (canTest) {
    actionGroups.push(
      {
        id: 'qa-pass',
        label: 'Approve',
        description: 'Approve implementation and send it to the Project Manager for deployment',
        tone: 'success',
        icon: CheckCircle2,
        testResult: 'PASS',
        submitLabel: 'Approve',
        onSubmit: () => runAction('/testing/result', { ...testResult, result: 'PASS' }),
      },
      {
        id: 'qa-fail',
        label: 'Reject',
        description: 'Reject implementation and return comments to the Project Manager',
        tone: 'error',
        icon: XCircle,
        testResult: 'FAIL',
        submitLabel: 'Reject',
        onSubmit: () => runAction('/testing/result', { ...testResult, result: 'FAIL' }),
      },
    );
  }

  if (canSendToRequesterTesting) {
    actionGroups.push({
      id: 'send-requester-testing',
      label: 'Send To Requester Testing',
      description: 'Send QA-approved work to the employee requester for user testing',
      tone: 'success',
      icon: Send,
      requesterTesting: true,
      submitLabel: 'Send To Requester',
      onSubmit: () => runAction('/uat/send-to-requester', { comment: actionComment }),
    });
  }

  if (canUat) {
    actionGroups.push({
      id: 'uat-approve',
      label: 'Approve User Testing',
      description: 'Confirm the delivered work is accepted and return it to the Project Manager',
      tone: 'success',
      icon: CheckCircle2,
      submitLabel: 'Approve',
      onSubmit: () => runAction('/uat/approve', { comments: actionComment }),
    });
  }

  if (canCompleteDeployment) {
    actionGroups.push({
      id: 'complete-deployment',
      label: 'Complete Deployment',
      description: 'Mark deployment complete and send the request back to the requester for final confirmation',
      tone: 'success',
      icon: CheckCircle2,
      submitLabel: 'Complete Deployment',
      onSubmit: () => runAction('/deployment/complete', { comment: actionComment }),
    });
  }

  if (canRequesterComplete) {
    actionGroups.push({
      id: 'requester-complete',
      label: 'Complete Request',
      description: 'Review the final outcome and close this request as completed',
      tone: 'success',
      icon: CheckCircle2,
      submitLabel: 'Complete Request',
      helper: 'Preview or download the final ISMS report before completing the request.',
      onSubmit: () => runAction('/requester/complete', { comment: actionComment }),
    });
  }

  if (canCloseRequest) {
    actionGroups.push({
      id: 'close-request',
      label: 'Close Request',
      description: 'Close the request after deployment confirmation',
      tone: 'success',
      icon: CheckCircle2,
      requireDecisionNotes: true,
      submitLabel: 'Close Request',
      onSubmit: () => runAction('/close', { comment: actionComment }),
    });
  }

  if (canWithdrawRequest) {
    actionGroups.push({
      id: 'withdraw-request',
      label: 'Withdraw Request',
      description: 'Cancel this request and stop all further workflow actions',
      tone: 'error',
      icon: XCircle,
      requireDecisionNotes: true,
      submitLabel: 'Withdraw Request',
      helper: 'All relevant stakeholders will be notified that you withdrew this request.',
      onSubmit: () => runAction('/withdraw', { comment: actionComment }),
    });
  }

  const selectedAction = actionGroups.find((item) => item.id === selectedActionId);
  const decisionReady = !selectedAction
    ? false
    : selectedAction.clarification
      ? clarificationDetails.note.trim().length >= 5
      : selectedAction.itReview
        ? review.feasibilityNotes.trim().length >= 3 && review.estimatedEffort.trim().length >= 1
        : selectedAction.qaSubmit
          ? Boolean(assignment.qaUserId)
        : selectedAction.reworkTasks
          ? qaReworkTasks.some((task) => task.title.trim().length >= 3)
        : selectedAction.requesterTesting
          ? actionComment.trim().length >= 3
        : selectedAction.assignment
          ? selectedAction.assignmentMode === 'project-manager'
            ? Boolean(assignment.projectManagerUserId)
            : selectedAction.assignmentMode === 'developer'
            ? Boolean(assignment.developerUserId && (assignment.qaUserId || request.active_qa_user_id))
            : selectedAction.assignmentMode === 'qa'
              ? Boolean((assignment.developerUserId || request.active_developer_user_id) && assignment.qaUserId)
              : Boolean(assignment.developerUserId && assignment.qaUserId)
          : selectedAction.testResult
              ? testResult.testSummary.trim().length >= 3
              : selectedAction.requireDecisionNotes || selectedAction.id.includes('respond')
                ? actionComment.trim().length >= 3
                : true;

  function submitSelectedAction() {
    if (!decisionReady) {
      const message = 'Complete the required workflow fields before submitting.';
      setError?.(message);
      showToast?.(message, { severity: 'error', autoHideDuration: 5200 });
      requestAnimationFrame(() => {
        const firstEmptyRequired = [...document.querySelectorAll('[required]')]
          .find((field) => !String(field.value || '').trim());
        firstEmptyRequired?.focus();
      });
      return;
    }
    selectedAction.onSubmit();
  }

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
              <Typography variant="caption" color="text.secondary">Pending With</Typography>
              <Typography variant="caption" fontWeight={820} sx={{ display: 'block' }}>{getPendingWithName(request)}</Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Typography variant="caption" fontWeight={820} sx={{ display: 'block' }}>
                {getWorkflowStatusCaption(request.status)}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {!hasActions && role !== 'EMPLOYEE' ? (
          <EmptyInline message="No workflow actions are available for your role at this stage." />
        ) : (
          <Stack spacing={1}>
            {canReviewIt && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.75,
                  border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                  bgcolor: (theme) => theme.custom.semantic.paper,
                }}
              >
                <Stack spacing={1.35}>
                  <Typography variant="subtitle2" fontWeight={900}>Feasibility Assessment</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Internal review is not complete until you submit feasibility details with your approval decision.
                  </Typography>
                  <TextField label="Feasibility Notes" value={review.feasibilityNotes} onChange={(e) => setReview({ ...review, feasibilityNotes: e.target.value })} multiline minRows={3} required />
                  <TextField label="Complexity" select value={review.complexity} onChange={(e) => setReview({ ...review, complexity: e.target.value })} required>
                    {['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                  <TextField label="Estimated Effort" value={review.estimatedEffort} onChange={(e) => setReview({ ...review, estimatedEffort: e.target.value })} required />
                  <TextField label="Priority Confirmation" select value={review.priorityConfirmation} onChange={(e) => setReview({ ...review, priorityConfirmation: e.target.value })} required>
                    {priorities.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                </Stack>
              </Box>
            )}
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

              {selectedAction.assignment && (
                <>
                  {selectedAction.assignmentMode === 'project-manager' && (
                    <>
                      <TextField select label="Project Manager" value={assignment.projectManagerUserId || ''} onChange={(e) => setAssignment({ ...assignment, projectManagerUserId: e.target.value })}>
                        {projectManagers.map((projectManager) => (
                          <MenuItem key={projectManager.id} value={projectManager.id}>
                            {projectManager.full_name}
                          </MenuItem>
                        ))}
                      </TextField>
                      {projectManagers.length === 0 && (
                        <Alert severity="warning">
                          No active Project Manager is available. Add one before assigning this request.
                        </Alert>
                      )}
                    </>
                  )}
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
                  {['project-manager', 'team'].includes(selectedAction.assignmentMode) && (
                    <TextField
                      label="Assignment Notes"
                      value={assignment.notes}
                      onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}
                      placeholder="Add context for the delivery team."
                      multiline
                      minRows={3}
                    />
                  )}
                  {!['project-manager', 'team'].includes(selectedAction.assignmentMode) && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedAction.assignmentMode === 'developer'
                        ? `Reviewer remains ${request.active_qa_name || 'assigned reviewer'}.`
                        : `Assigned team member remains ${request.active_developer_name || 'assigned team member'}.`}
                    </Typography>
                  )}
                </>
              )}

              {selectedAction.qaSubmit && (
                <>
                  <TextField select label="QA Engineer" value={assignment.qaUserId || ''} onChange={(e) => setAssignment({ ...assignment, qaUserId: e.target.value })}>
                    {qaUsers.map((qa) => <MenuItem key={qa.id} value={qa.id}>{qa.full_name}</MenuItem>)}
                  </TextField>
                  <TextField
                    label="QA Handoff Notes"
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="Summarize what is ready for QA and any test focus areas."
                    multiline
                    minRows={3}
                  />
                  {qaUsers.length === 0 && (
                    <Alert severity="warning">No active QA engineer is available. Add one before submitting for QA.</Alert>
                  )}
                </>
              )}

              {selectedAction.requesterTesting && (
                <TextField
                  label="Testing Instructions For Requester"
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder="Tell the requester where to test, what flow to verify, sample data to use, and anything they should pay attention to."
                  multiline
                  minRows={4}
                  required
                />
              )}

              {selectedAction.reworkTasks && (
                <Stack spacing={1.2}>
                  <TextField
                    label="PM Notes For Developer"
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="Summarize QA rejection context and expectations."
                    multiline
                    minRows={2}
                  />
                  <Typography variant="caption" color="text.secondary" fontWeight={850}>
                    Bug Fixing Sprint Todo List
                  </Typography>
                  {qaReworkTasks.map((task, index) => (
                    <Box key={`qa-rework-${index}`} sx={{ p: 1.15, borderRadius: 1.5, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
                      <Stack spacing={1}>
                        <TextField
                          label={`Todo ${index + 1}`}
                          value={task.title}
                          onChange={(event) => setQaReworkTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                          placeholder="Example: Fix validation error on submit"
                          required
                        />
                        <TextField
                          label="Details"
                          value={task.description}
                          onChange={(event) => setQaReworkTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                          multiline
                          minRows={2}
                        />
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <TextField
                            select
                            label="Priority"
                            value={task.priority}
                            onChange={(event) => setQaReworkTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priority: event.target.value } : item))}
                            sx={{ minWidth: 150 }}
                          >
                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>)}
                          </TextField>
                          <Button
                            color="error"
                            size="small"
                            onClick={() => setQaReworkTasks((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)}
                            disabled={qaReworkTasks.length === 1}
                          >
                            Remove
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                  <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setQaReworkTasks((current) => [...current, { title: '', description: '', priority: 'HIGH' }])}>
                    Add Todo
                  </Button>
                  <Alert severity="info">
                    Sending this back will automatically create an active Bug Fixing Sprint and assign these todos to the delivery developer.
                  </Alert>
                </Stack>
              )}

              {selectedAction.testResult && (
                <>
                  <TextField
                    label="QA Notes / Comments"
                    value={testResult.testSummary}
                    onChange={(e) => setTestResult({ ...testResult, testSummary: e.target.value })}
                    multiline
                    minRows={3}
                    required
                  />
                  {selectedAction.testResult !== 'PASS' && (
                    <TextField label="Defects / Required Fixes" value={testResult.defectsFound} onChange={(e) => setTestResult({ ...testResult, defectsFound: e.target.value })} multiline minRows={2} />
                  )}
                </>
              )}

              {selectedAction.id === 'uat-approve' && requesterTestingNote && (
                <Alert severity="info">
                  <Typography variant="caption" fontWeight={900} sx={{ display: 'block', mb: 0.35 }}>
                    Project Manager Testing Instructions
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {requesterTestingNote}
                  </Typography>
                </Alert>
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

              <Button
                variant="contained"
                onClick={submitSelectedAction}
                sx={{
                  color: (theme) => theme.palette.mode === 'dark' ? '#FFFFFF' : undefined,
                  '&.Mui-disabled': {
                    color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.62)' : undefined,
                  },
                }}
              >
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
    success: { color: 'success.main', bg: (theme) => theme.palette.mode === 'dark' ? 'rgba(22,163,74,0.18)' : '#DCFCE7', border: '#86EFAC' },
    warning: { color: 'warning.main', bg: (theme) => theme.palette.mode === 'dark' ? 'rgba(217,119,6,0.18)' : '#FEF3C7', border: '#FCD34D' },
    error: { color: 'error.main', bg: (theme) => theme.palette.mode === 'dark' ? 'rgba(220,38,38,0.18)' : '#FEE2E2', border: '#FCA5A5' },
    neutral: { color: 'text.primary', bg: (theme) => theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.16)' : '#F1F5F9', border: '#CBD5E1' },
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
        color: (theme) => theme.palette.mode === 'dark' ? '#FFFFFF' : 'inherit',
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
            bgcolor: selected ? (theme) => theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.92)' : '#FFFFFF' : tone.bg,
            border: `1px solid ${tone.border}`,
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={2.3} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            fontWeight={900}
            color={(theme) => theme.palette.mode === 'dark' ? '#FFFFFF' : selected ? tone.color : 'text.primary'}
          >
            {action.label}
          </Typography>
          <Typography
            variant="caption"
            color={(theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.76)' : 'text.secondary'}
            sx={{ display: 'block', lineHeight: 1.25 }}
          >
            {action.description}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
