import { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { formatEnum, missingReportingAuthorityText, priorities, requestTypes } from '../utils/constants';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';

const DRAFT_KEY = 'requestops.createRequestDraft';

const emptyForm = {
  title: '',
  requestType: 'NEW_FEATURE',
  priority: 'MEDIUM',
  businessJustification: '',
  description: '',
  expectedBenefits: '',
  roiType: '',
  roiHoursSavedPerEmployeePerMonth: '',
  roiUsersImpacted: '',
  roiTimeSavedPerTask: '',
  roiTimeSavedUnit: 'MINUTES',
  roiOccurrencesPerMonth: '',
  roiEmployeesBenefited: '',
  roiEstimatedHourlyCostInr: '',
  roiEstimatedRevenueImpactInr: '',
  roiBusinessImpactCategory: '',
  roiMonthlyCostSavingsInr: '',
};

const workflowSteps = [
  { label: 'Request Details', description: 'You are currently creating the request' },
  { label: 'Submitted', description: 'Request enters workflow' },
  { label: 'Department Approval', description: 'Department Head review' },
  { label: 'Internal Review', description: 'Feasibility assessment' },
  { label: 'Waiting For Assignment', description: 'Team assignment' },
  { label: 'Work In Progress', description: 'Request is being worked on' },
  { label: 'Review & Validation', description: 'Quality review and validation' },
  { label: 'Requester UAT for Pre-Deployment', description: 'Validate the deployed solution before final production release' },
  { label: 'Final Deployment Pending', description: 'Awaiting final production deployment' },
  { label: 'Sign-Off', description: 'Request signed off and closed' },
];

const currentWorkflowStage = 0;

const requestTips = [
  'Keep the title concise',
  'Be specific about the business need',
  'Describe business impact',
  'Mention affected users',
];

const businessImpactCategories = [
  { value: 'PRODUCTIVITY_IMPROVEMENT', label: 'Productivity Improvement' },
  { value: 'COST_REDUCTION', label: 'Cost Reduction' },
  { value: 'REVENUE_INCREASE', label: 'Revenue Increase' },
  { value: 'PROCESS_AUTOMATION', label: 'Process Automation' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'QUALITY_IMPROVEMENT', label: 'Quality Improvement' },
  { value: 'CUSTOMER_SATISFACTION', label: 'Customer Satisfaction' },
];

function getInitialForm() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return draft ? { ...emptyForm, ...draft } : emptyForm;
  } catch {
    return emptyForm;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function mergeFiles(currentFiles, incomingFiles) {
  const existing = new Set(currentFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
  const nextFiles = [...currentFiles];

  incomingFiles.forEach((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (!existing.has(key)) {
      existing.add(key);
      nextFiles.push(file);
    }
  });

  return nextFiles;
}

function cleanRequestPayload(form) {
  return {
    title: form.title.trim(),
    requestType: form.requestType,
    priority: form.priority,
    businessJustification: form.businessJustification.trim(),
    description: form.description.trim(),
    expectedBenefits: form.expectedBenefits.trim() || null,
    roiType: null,
    roiHoursSavedPerEmployeePerMonth: null,
    roiUsersImpacted: form.roiUsersImpacted === '' ? null : Number(form.roiUsersImpacted),
    roiTimeSavedPerTask: form.roiTimeSavedPerTask === '' ? null : Number(form.roiTimeSavedPerTask),
    roiTimeSavedUnit: form.roiTimeSavedUnit || 'MINUTES',
    roiOccurrencesPerMonth: form.roiOccurrencesPerMonth === '' ? null : Number(form.roiOccurrencesPerMonth),
    roiEmployeesBenefited: form.roiEmployeesBenefited === '' ? null : Number(form.roiEmployeesBenefited),
    roiEstimatedHourlyCostInr: form.roiEstimatedHourlyCostInr === '' ? null : Number(form.roiEstimatedHourlyCostInr),
    roiEstimatedRevenueImpactInr: form.roiEstimatedRevenueImpactInr === '' ? null : Number(form.roiEstimatedRevenueImpactInr),
    roiBusinessImpactCategory: form.roiBusinessImpactCategory || null,
    roiMonthlyCostSavingsInr: null,
  };
}

function validateRequestPayload(payload) {
  const fieldErrors = {};
  if (payload.title.length < 5) fieldErrors.title = 'Request title must be at least 5 characters.';
  if (payload.businessJustification.length < 5) fieldErrors.businessJustification = 'Business justification must be at least 5 characters.';
  if (payload.description.length < 10) fieldErrors.description = 'Detailed description must be at least 10 characters.';
  const hasRoiInput = [
    payload.roiUsersImpacted,
    payload.roiTimeSavedPerTask,
    payload.roiOccurrencesPerMonth,
    payload.roiEmployeesBenefited,
    payload.roiEstimatedHourlyCostInr,
    payload.roiEstimatedRevenueImpactInr,
    payload.roiBusinessImpactCategory,
  ].some(Boolean);
  if (hasRoiInput) {
    if (!payload.roiBusinessImpactCategory) fieldErrors.roiBusinessImpactCategory = 'Select the business impact category.';
    if (!payload.roiUsersImpacted) fieldErrors.roiUsersImpacted = 'Enter the number of users impacted.';
    if (!payload.roiTimeSavedPerTask) fieldErrors.roiTimeSavedPerTask = 'Enter time saved per task.';
    if (!payload.roiOccurrencesPerMonth) fieldErrors.roiOccurrencesPerMonth = 'Enter occurrences per month.';
    if (!payload.roiEmployeesBenefited) fieldErrors.roiEmployeesBenefited = 'Enter employees benefited.';
    if (!payload.roiEstimatedHourlyCostInr) fieldErrors.roiEstimatedHourlyCostInr = 'Enter estimated hourly cost.';
  }
  return fieldErrors;
}

function calculateAnnualRoi(form) {
  const timeSaved = Number(form.roiTimeSavedPerTask || 0);
  const timeSavedHours = form.roiTimeSavedUnit === 'HOURS' ? timeSaved : timeSaved / 60;
  const occurrences = Number(form.roiOccurrencesPerMonth || 0);
  const employees = Number(form.roiEmployeesBenefited || 0);
  const hourlyCost = Number(form.roiEstimatedHourlyCostInr || 0);
  const revenueImpact = Number(form.roiEstimatedRevenueImpactInr || 0);
  const monthlyHours = timeSavedHours * occurrences * employees;
  const annualHours = monthlyHours * 12;
  const annualCostSavings = annualHours * hourlyCost;
  const monthlyCapacity = employees * 160;
  const automationPercentage = monthlyCapacity ? Math.min(100, (monthlyHours / monthlyCapacity) * 100) : 0;
  const estimatedRoi = annualCostSavings + revenueImpact;
  return {
    monthlyHours,
    annualHours,
    annualCostSavings,
    automationPercentage,
    estimatedRoi,
  };
}

function formatApiError(err) {
  const fieldErrors = err.details?.fieldErrors;
  if (fieldErrors) {
    const messages = Object.values(fieldErrors).flat().filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  return err.message;
}

export default function RequestCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const formRef = useRef(null);
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [form, setForm] = useState(getInitialForm);

  const attachmentTotal = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );
  const roi = useMemo(() => calculateAnnualRoi(form), [form]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setMessage('');
  }

  function focusFirstInvalidField(errors) {
    const firstField = Object.keys(errors).find((field) => errors[field]);
    if (!firstField) return;
    requestAnimationFrame(() => formRef.current?.querySelector(`[name="${firstField}"]`)?.focus());
  }

  function addFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    if (!incomingFiles.length) return;
    setFiles((current) => mergeFiles(current, incomingFiles));
    setMessage('');
  }

  function removeFile(fileToRemove) {
    setFiles((current) => current.filter((file) => file !== fileToRemove));
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setError('');
    setMessage('Draft saved on this device.');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const payload = cleanRequestPayload(form);
    const validationErrors = validateRequestPayload(payload);
    if (Object.keys(validationErrors).length) {
      const summary = Object.values(validationErrors).filter(Boolean).join(' ');
      setFieldErrors(validationErrors);
      setError(summary);
      showToast(summary, { severity: 'error', autoHideDuration: 5200 });
      focusFirstInvalidField(validationErrors);
      return;
    }
    setSubmitting(true);
    let createdRequest = null;

    try {
      createdRequest = await api.post('/requests', payload);
      showToast('Request submitted successfully and routed for approval.');

      await Promise.all(files.map((file) => {
        const data = new FormData();
        data.append('file', file);
        return api.post(`/requests/${createdRequest.id}/attachments`, data);
      }));

      localStorage.removeItem(DRAFT_KEY);
      navigate(`/requests/${createdRequest.id}`);
    } catch (err) {
      const missingDepartmentHead = err.message.includes(missingReportingAuthorityText);
      setError(
        createdRequest
          ? `Request was created, but one or more attachments could not be uploaded. Open ${createdRequest.requestNumber || 'the request'} and try uploading again.`
          : missingDepartmentHead
            ? `${missingReportingAuthorityText}. Please contact the System Administrator to configure a reporting authority for your department.`
            : formatApiError(err),
      );
      setSubmitting(false);
    }
  }

  return (
    <Page maxWidth={1460}>
      <Stack spacing={2}>
        <PageHeader
          eyebrow="REQUEST MANAGEMENT"
          title="Create Request"
          description="Submit a new software requirement request for review, approval, and delivery."
          actions={(
            <Chip
              size="small"
              label="Department approval starts after submit"
              sx={{
                borderRadius: 1.25,
                bgcolor: (theme) => theme.custom.semantic.paperSoft,
                border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                color: 'text.secondary',
                fontWeight: 700,
                whiteSpace: 'normal',
                height: 'auto',
                py: 0.4,
              }}
            />
          )}
        />

        <Grid container spacing={2.5} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, lg: 8.7 }}>
            <Box
              component="form"
              ref={formRef}
              onSubmit={handleSubmit}
              sx={{
                borderRadius: 2.5,
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
                  py: 1.5,
                  borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                  bgcolor: (theme) => theme.custom.semantic.paperSoft,
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 1.5,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'primary.main',
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF',
                      border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                    }}
                  >
                    <ArticleOutlinedIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={820}>Request Details</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Required fields are routed for review after submission.
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No attachments selected'}
                </Typography>
              </Stack>

              <Stack spacing={1.75} sx={{ p: { xs: 2, md: 2.25 }, pb: { xs: 10, sm: 2.25 } }}>
                {error && <Alert severity="error">{error}</Alert>}
                {message && <Alert severity="success">{message}</Alert>}

                <TextField
                  label="Request Title"
                  name="title"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  required
                  fullWidth
                  placeholder="Example: Automate vendor onboarding approval workflow"
                  error={Boolean(fieldErrors.title)}
                  helperText={fieldErrors.title || 'Use a concise title that describes the requested outcome.'}
                />

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      label="Request Type"
                      value={form.requestType}
                      onChange={(e) => update('requestType', e.target.value)}
                      fullWidth
                    >
                      {requestTypes.map((type) => (
                        <MenuItem key={type} value={type}>{formatEnum(type)}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      label="Priority"
                      value={form.priority}
                      onChange={(e) => update('priority', e.target.value)}
                      fullWidth
                    >
                      {priorities.map((priority) => (
                        <MenuItem key={priority} value={priority}>{formatEnum(priority)}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>

                <TextField
                  label="Business Justification"
                  name="businessJustification"
                  value={form.businessJustification}
                  onChange={(e) => update('businessJustification', e.target.value)}
                  multiline
                  minRows={3}
                  required
                  error={Boolean(fieldErrors.businessJustification)}
                  helperText={fieldErrors.businessJustification}
                  placeholder="Explain the business problem, risk, or opportunity."
                />

                <TextField
                  label="Detailed Description"
                  name="description"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  multiline
                  minRows={4}
                  required
                  error={Boolean(fieldErrors.description)}
                  helperText={fieldErrors.description}
                  placeholder="Include process details, impacted teams, current workflow, and expected behavior."
                />

                <TextField
                  label="Expected Benefits"
                  value={form.expectedBenefits}
                  onChange={(e) => update('expectedBenefits', e.target.value)}
                  multiline
                  minRows={3}
                  placeholder="Examples: reduced manual effort, improved controls, faster approvals, better reporting."
                />

                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                    bgcolor: (theme) => theme.custom.semantic.paperSoft,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={820}>ROI Information</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Estimate measurable business value using simple inputs. Calculated values update automatically for approval review.
                  </Typography>
                  <Grid container spacing={1.5} sx={{ mt: 1 }}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField select name="roiBusinessImpactCategory" label="Business Impact Category" value={form.roiBusinessImpactCategory} onChange={(e) => update('roiBusinessImpactCategory', e.target.value)} fullWidth error={Boolean(fieldErrors.roiBusinessImpactCategory)} helperText={fieldErrors.roiBusinessImpactCategory || 'Choose the primary business outcome this request supports.'}>
                        <MenuItem value="">Select category</MenuItem>
                        {businessImpactCategories.map((option) => (
                          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField name="roiUsersImpacted" label="Number of Users Impacted" type="number" value={form.roiUsersImpacted} onChange={(e) => update('roiUsersImpacted', e.target.value)} fullWidth error={Boolean(fieldErrors.roiUsersImpacted)} helperText={fieldErrors.roiUsersImpacted || 'Total business users or customers affected by this improvement.'} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField name="roiTimeSavedPerTask" label="Time Saved per Task" type="number" value={form.roiTimeSavedPerTask} onChange={(e) => update('roiTimeSavedPerTask', e.target.value)} fullWidth error={Boolean(fieldErrors.roiTimeSavedPerTask)} helperText={fieldErrors.roiTimeSavedPerTask || 'Estimated time saved each time the process is completed.'} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <TextField select label="Unit" value={form.roiTimeSavedUnit} onChange={(e) => update('roiTimeSavedUnit', e.target.value)} fullWidth helperText="Minutes or hours">
                        <MenuItem value="MINUTES">Minutes</MenuItem>
                        <MenuItem value="HOURS">Hours</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField name="roiOccurrencesPerMonth" label="Occurrences per Month" type="number" value={form.roiOccurrencesPerMonth} onChange={(e) => update('roiOccurrencesPerMonth', e.target.value)} fullWidth error={Boolean(fieldErrors.roiOccurrencesPerMonth)} helperText={fieldErrors.roiOccurrencesPerMonth || 'How often this task/process happens each month.'} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField name="roiEmployeesBenefited" label="Employees Benefited" type="number" value={form.roiEmployeesBenefited} onChange={(e) => update('roiEmployeesBenefited', e.target.value)} fullWidth error={Boolean(fieldErrors.roiEmployeesBenefited)} helperText={fieldErrors.roiEmployeesBenefited || 'Employees whose work time is reduced by this request.'} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField name="roiEstimatedHourlyCostInr" label="Estimated Hourly Cost (₹)" type="number" value={form.roiEstimatedHourlyCostInr} onChange={(e) => update('roiEstimatedHourlyCostInr', e.target.value)} fullWidth error={Boolean(fieldErrors.roiEstimatedHourlyCostInr)} helperText={fieldErrors.roiEstimatedHourlyCostInr || 'Average hourly employee cost used to calculate annual savings.'} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField name="roiEstimatedRevenueImpactInr" label="Estimated Revenue Impact (₹) (Optional)" type="number" value={form.roiEstimatedRevenueImpactInr} onChange={(e) => update('roiEstimatedRevenueImpactInr', e.target.value)} fullWidth helperText="Optional expected annual revenue uplift or protected revenue." />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ mt: 0.5, p: 1.5, borderRadius: 1.5, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: 'background.paper' }}>
                        <Typography variant="subtitle2" fontWeight={820} sx={{ mb: 1 }}>Calculated Business Impact</Typography>
                        <Grid container spacing={1.25}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField label="Hours Saved per Month" value={roi.monthlyHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} fullWidth InputProps={{ readOnly: true }} helperText="Time saved per task x occurrences per month x employees benefited." />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField label="Hours Saved per Year" value={roi.annualHours.toLocaleString('en-IN', { maximumFractionDigits: 2 })} fullWidth InputProps={{ readOnly: true }} helperText="Hours saved per month x 12." />
                          </Grid>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <TextField label="Annual Cost Savings" value={`₹${roi.annualCostSavings.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} fullWidth InputProps={{ readOnly: true }} helperText="Hours saved per year x estimated hourly cost." />
                          </Grid>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <TextField label="Automation Percentage" value={`${roi.automationPercentage.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`} fullWidth InputProps={{ readOnly: true }} helperText="Monthly hours saved as a share of benefited employees' monthly work capacity." />
                          </Grid>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <TextField label="Estimated ROI" value={`₹${roi.estimatedRoi.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} fullWidth InputProps={{ readOnly: true }} helperText="Annual cost savings + optional revenue impact." />
                          </Grid>
                        </Grid>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>

                <Box>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 1 }}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={820}>Attachments Optional</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Add screenshots, specs, or evidence only if available. You can submit without attachments.
                      </Typography>
                    </Box>
                    {files.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Total {formatBytes(attachmentTotal)}
                      </Typography>
                    )}
                  </Stack>

                  <Box
                    onDragEnter={() => setIsDragging(true)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      addFiles(event.dataTransfer.files);
                    }}
                    sx={{
                      borderRadius: 2,
                      border: (theme) => `1px dashed ${isDragging ? theme.palette.primary.main : theme.custom.semantic.border}`,
                      bgcolor: (theme) => isDragging
                        ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.12)' : '#EFF6FF')
                        : theme.custom.semantic.paperSoft,
                      p: 1.75,
                      transition: 'border-color 160ms ease, background-color 160ms ease',
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}
                    >
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1.5,
                            display: 'grid',
                            placeItems: 'center',
                            color: 'primary.main',
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#FFFFFF',
                            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                          }}
                        >
                          <CloudUploadOutlinedIcon />
                        </Box>
                        <Box>
                          <Typography fontWeight={820}>Drag and drop optional files here</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Multiple files supported. Files upload when you submit, but they are not required.
                          </Typography>
                        </Box>
                      </Stack>
                      <Button variant="outlined" onClick={() => fileInputRef.current?.click()} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                        Browse Files
                      </Button>
                      <input
                        ref={fileInputRef}
                        hidden
                        multiple
                        type="file"
                        onChange={(event) => {
                          addFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </Stack>
                  </Box>

                  {files.length > 0 && (
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      {files.map((file) => (
                        <Stack
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          sx={{
                            alignItems: { xs: 'stretch', sm: 'center' },
                            justifyContent: 'space-between',
                            px: 1.25,
                            py: 0.85,
                            borderRadius: 1.5,
                            border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                            bgcolor: (theme) => theme.custom.semantic.paper,
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={760} sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{formatBytes(file.size)}</Typography>
                          </Box>
                          <Button
                            size="small"
                            color="inherit"
                            startIcon={<DeleteOutlinedIcon />}
                            onClick={() => removeFile(file)}
                            sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
                          >
                            Remove
                          </Button>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>

              <Stack
                direction={{ xs: 'column-reverse', sm: 'row' }}
                spacing={1}
                sx={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  px: 2.25,
                  py: 1.5,
                  pb: 'calc(12px + env(safe-area-inset-bottom))',
                  borderTop: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
                  bgcolor: (theme) => theme.custom.semantic.paper,
                  justifyContent: 'flex-end',
                  alignItems: { xs: 'stretch', sm: 'center' },
                }}
              >
                <Button variant="outlined" color="inherit" onClick={() => navigate('/requests')} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="outlined" startIcon={<SaveOutlinedIcon />} onClick={saveDraft} disabled={submitting}>
                  Save Draft
                </Button>
                <Button type="submit" variant="contained" startIcon={<SendIcon />} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, lg: 3.3 }}>
            <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: 82 }, maxWidth: { lg: 320 }, ml: { lg: 'auto' } }}>
              <WorkflowOverview />

              <CompactPanel title="Request Tips" icon={<LightbulbOutlinedIcon fontSize="small" />}>
                <Stack spacing={1}>
                  {requestTips.map((tip) => (
                    <Stack key={tip} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                      <Box
                        sx={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          mt: 0.85,
                          bgcolor: 'primary.main',
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" color="text.secondary">{tip}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </CompactPanel>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Page>
  );
}

function WorkflowOverview() {
  const currentStage = workflowSteps[currentWorkflowStage];

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
      <Box
        sx={{
          px: 2,
          py: 1.6,
          borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => theme.custom.semantic.paperSoft,
        }}
      >
        <Stack direction="row" spacing={1.1} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              color: 'primary.main',
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF',
              border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
            }}
          >
            <AccountTreeRoundedIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={880}>Workflow Overview</Typography>
            <Typography variant="caption" color="text.secondary">
              Current Step: {currentStage.label}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2 }}>
        <Stack spacing={0}>
          {workflowSteps.map((step, index) => (
            <WorkflowTimelineStage
              key={step.label}
              step={step}
              index={index}
              isLast={index === workflowSteps.length - 1}
              state={index < currentWorkflowStage ? 'completed' : index === currentWorkflowStage ? 'current' : 'upcoming'}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function WorkflowTimelineStage({ step, index, isLast, state }) {
  const isCompleted = state === 'completed';
  const isCurrent = state === 'current';

  return (
    <Stack
      direction="row"
      spacing={1.35}
      sx={{
        position: 'relative',
        pb: isLast ? 0 : 1.55,
        '&:hover .workflow-stage-card': {
          borderColor: (theme) => isCurrent ? theme.palette.primary.main : theme.custom.semantic.border,
          bgcolor: (theme) => {
            if (isCurrent) return theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#F8FBFF';
            return theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.06)' : '#FFFFFF';
          },
        },
      }}
    >
      <Stack sx={{ alignItems: 'center', width: 28, flexShrink: 0 }}>
        <Box
          sx={{
            width: isCurrent ? 30 : 24,
            height: isCurrent ? 30 : 24,
            mt: 0.1,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: isCompleted ? '#FFFFFF' : isCurrent ? 'primary.main' : 'text.disabled',
            bgcolor: (theme) => {
              if (isCompleted) return theme.palette.success.main;
              if (isCurrent) return theme.palette.mode === 'dark' ? '#0B1F4D' : '#EFF6FF';
              return theme.palette.mode === 'dark' ? '#111827' : '#F8FAFC';
            },
            border: (theme) => {
              if (isCompleted) return `1px solid ${theme.palette.success.main}`;
              if (isCurrent) return `2px solid ${theme.palette.primary.main}`;
              return `1px solid ${theme.custom.semantic.border}`;
            },
            boxShadow: isCurrent ? '0 0 0 5px rgba(37,99,235,0.12)' : 'none',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
          }}
        >
          {isCompleted ? (
            <CheckCircleIcon sx={{ fontSize: 16 }} />
          ) : (
            <Typography variant="caption" fontWeight={880} sx={{ lineHeight: 1 }}>
              {index + 1}
            </Typography>
          )}
        </Box>

        {!isLast && (
          <Box
            sx={{
              width: 2,
              flex: 1,
              minHeight: 34,
              mt: 0.6,
              borderRadius: 99,
              background: (theme) => {
                if (isCompleted) return theme.palette.success.main;
                return theme.custom.semantic.borderSoft;
              },
            }}
          />
        )}
      </Stack>

      <Box
        className="workflow-stage-card"
        sx={{
          flex: 1,
          minWidth: 0,
          px: isCurrent ? 1.5 : 1.25,
          py: isCurrent ? 1.15 : 0.9,
          borderRadius: 1.5,
          border: (theme) => `1px solid ${isCurrent ? theme.palette.primary.main : 'transparent'}`,
          bgcolor: (theme) => {
            if (isCurrent) return theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.12)' : '#F8FBFF';
            return 'transparent';
          },
          transition: 'background-color 160ms ease, border-color 160ms ease',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography
            variant="body2"
            fontWeight={isCurrent ? 900 : 720}
            color={isCurrent ? 'primary.main' : 'text.secondary'}
          >
            {step.label}
          </Typography>
          {isCurrent && (
            <Chip
              size="small"
              label="Current Step"
              sx={{
                height: 20,
                borderRadius: 1,
                fontSize: 11,
                fontWeight: 820,
                color: 'primary.main',
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#DBEAFE',
              }}
            />
          )}
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mt: 0.25,
            lineHeight: 1.35,
            fontWeight: isCurrent ? 650 : 500,
          }}
        >
          {step.description}
        </Typography>
      </Box>
    </Stack>
  );
}

function CompactPanel({ title, icon, children }) {
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
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2,
          py: 1.35,
          borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => theme.custom.semantic.paperSoft,
        }}
      >
        {icon}
        <Typography variant="subtitle2" fontWeight={850}>{title}</Typography>
      </Stack>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}
