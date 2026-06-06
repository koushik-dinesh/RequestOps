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
  roiEmployeesBenefited: '',
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
  { label: 'Final Approval', description: 'Final business approval' },
  { label: 'Completed', description: 'Request completed' },
];

const currentWorkflowStage = 0;

const requestTips = [
  'Keep the title concise',
  'Be specific about the business need',
  'Describe business impact',
  'Mention affected users',
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
    roiType: form.roiType || null,
    roiHoursSavedPerEmployeePerMonth: form.roiType === 'TIME_SAVINGS' ? Number(form.roiHoursSavedPerEmployeePerMonth || 0) : null,
    roiEmployeesBenefited: form.roiType === 'TIME_SAVINGS' ? Number(form.roiEmployeesBenefited || 0) : null,
    roiMonthlyCostSavingsInr: form.roiType === 'COST_SAVINGS' ? Number(form.roiMonthlyCostSavingsInr || 0) : null,
  };
}

function validateRequestPayload(payload) {
  if (payload.title.length < 5) return 'Request title must be at least 5 characters.';
  if (payload.businessJustification.length < 5) return 'Business justification must be at least 5 characters.';
  if (payload.description.length < 10) return 'Detailed description must be at least 10 characters.';
  if (payload.roiType === 'TIME_SAVINGS' && (!payload.roiHoursSavedPerEmployeePerMonth || !payload.roiEmployeesBenefited)) return 'Enter both time savings ROI values.';
  if (payload.roiType === 'COST_SAVINGS' && !payload.roiMonthlyCostSavingsInr) return 'Enter monthly cost savings for ROI.';
  return '';
}

function calculateAnnualRoi(form) {
  if (form.roiType === 'TIME_SAVINGS') {
    const monthly = Number(form.roiHoursSavedPerEmployeePerMonth || 0) * Number(form.roiEmployeesBenefited || 0);
    return { monthly, annual: monthly * 12, label: `${monthly.toLocaleString('en-IN')} monthly hours / ${(monthly * 12).toLocaleString('en-IN')} annual hours` };
  }
  if (form.roiType === 'COST_SAVINGS') {
    const annual = Number(form.roiMonthlyCostSavingsInr || 0) * 12;
    return { annual, label: `₹${annual.toLocaleString('en-IN')} annual savings` };
  }
  return { annual: 0, label: 'Select ROI type to calculate value' };
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
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
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
    setMessage('');
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
    const validationError = validateRequestPayload(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    let createdRequest = null;

    try {
      createdRequest = await api.post('/requests', payload);

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
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  required
                  fullWidth
                  placeholder="Example: Automate vendor onboarding approval workflow"
                  helperText="Use a concise title that describes the requested outcome."
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
                  value={form.businessJustification}
                  onChange={(e) => update('businessJustification', e.target.value)}
                  multiline
                  minRows={3}
                  required
                  placeholder="Explain the business problem, risk, or opportunity."
                />

                <TextField
                  label="Detailed Description"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  multiline
                  minRows={4}
                  required
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
                    Estimate measurable business value for approval review.
                  </Typography>
                  <Grid container spacing={1.5} sx={{ mt: 1 }}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField select label="ROI Type" value={form.roiType} onChange={(e) => update('roiType', e.target.value)} fullWidth>
                        <MenuItem value="">Not specified</MenuItem>
                        <MenuItem value="TIME_SAVINGS">Time Savings</MenuItem>
                        <MenuItem value="COST_SAVINGS">Cost Savings</MenuItem>
                      </TextField>
                    </Grid>
                    {form.roiType === 'TIME_SAVINGS' && (
                      <>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField label="Hours Saved Per Employee Per Month" type="number" value={form.roiHoursSavedPerEmployeePerMonth} onChange={(e) => update('roiHoursSavedPerEmployeePerMonth', e.target.value)} fullWidth />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField label="Employees Benefited" type="number" value={form.roiEmployeesBenefited} onChange={(e) => update('roiEmployeesBenefited', e.target.value)} fullWidth />
                        </Grid>
                      </>
                    )}
                    {form.roiType === 'COST_SAVINGS' && (
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField label="Monthly Cost Savings (INR)" type="number" value={form.roiMonthlyCostSavingsInr} onChange={(e) => update('roiMonthlyCostSavingsInr', e.target.value)} fullWidth />
                      </Grid>
                    )}
                    <Grid size={{ xs: 12 }}>
                      <Alert severity="info" sx={{ py: 0.5 }}>
                        {roi.label}
                      </Alert>
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
                      <Typography variant="subtitle2" fontWeight={820}>Attachments</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Upload screenshots, specs, documents, or evidence with this request.
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
                          <Typography fontWeight={820}>Drag and drop files here</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Multiple files supported. Attachments upload when you submit.
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
