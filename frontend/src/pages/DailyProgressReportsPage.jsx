import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import jsPDF from 'jspdf';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/ToastProvider';
import { formatEnum } from '../utils/constants';

const emptyConfig = {
  isEnabled: true,
  reportTime: '19:00',
  recipientUserIds: [],
  staleThresholdDays: 3,
  overdueThresholdDays: 7,
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function downloadReportPdf(report) {
  const payload = report.payload || {};
  const summary = payload.summary || {};
  const requests = payload.requests || [];
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 14;
  let y = 16;

  function addText(text, x, nextY, options = {}) {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size || 10);
    const lines = doc.splitTextToSize(String(text || '-'), options.width || 180);
    doc.text(lines, x, nextY);
    return nextY + lines.length * (options.lineHeight || 5);
  }

  function ensureSpace(height = 24) {
    if (y + height > 282) {
      doc.addPage();
      y = 16;
    }
  }

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  y = addText('Violin Technologies', margin, 13, { size: 12, bold: true });
  y = addText('RequestOps Daily Progress Report', margin, y + 1, { size: 15, bold: true });
  doc.setTextColor(15, 23, 42);
  y = 44;
  y = addText(`Report Date: ${payload.reportDate || formatDate(report.report_date)}`, margin, y, { bold: true });
  y += 2;
  y = addText(`Total Active: ${summary.totalActiveRequests || 0} | Updated Today: ${summary.requestsUpdatedToday || 0} | No Activity: ${summary.requestsWithNoActivityToday || 0} | Pending Action: ${summary.requestsPendingAction || 0} | High Priority: ${summary.highPriorityRequests || 0} | Overdue: ${summary.overdueRequests || 0}`, margin, y, { width: 180 });
  y += 6;

  y = addText('Key Risks & Bottlenecks', margin, y, { size: 12, bold: true });
  (payload.keyRisks || []).forEach((risk) => {
    ensureSpace(12);
    y = addText(`- ${risk.label}: ${risk.count} request(s) ${risk.requests?.join(', ') || ''}`, margin, y, { width: 180 });
  });
  if (!(payload.keyRisks || []).length) y = addText('- No major risks identified.', margin, y);
  y += 5;

  y = addText('Request Breakdown', margin, y, { size: 12, bold: true });
  requests.forEach((request) => {
    ensureSpace(34);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, 196, y);
    y += 5;
    y = addText(`${request.requestId} - ${request.title}`, margin, y, { bold: true, width: 180 });
    y = addText(`${request.department} | ${formatEnum(request.status)} | ${formatEnum(request.priority)} | Developer: ${request.assignedDeveloper}`, margin, y, { width: 180 });
    y = addText(`Pending: ${request.pendingAction?.nextResponsiblePerson || '-'} - ${request.pendingAction?.currentBottleneck || '-'}`, margin, y, { width: 180 });
    if (request.highlights?.length) y = addText(`Highlights: ${request.highlights.join(', ')}`, margin, y, { width: 180 });
    y += 3;
  });

  doc.save(`requestops-daily-progress-${payload.reportDate || report.report_date}.pdf`);
}

export default function DailyProgressReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [config, setConfig] = useState(emptyConfig);
  const [recipientOptions, setRecipientOptions] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generatingNow, setGeneratingNow] = useState(false);
  const canConfigure = user?.roleCode === 'SYSTEM_ADMIN';

  async function loadReports() {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const data = await api.get(`/daily-progress-reports${params.toString() ? `?${params}` : ''}`);
    setReports(data);
    return data;
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [reportRows, configResponse, recipients] = await Promise.all([
        loadReports(),
        api.get('/daily-progress-reports/config'),
        api.get('/daily-progress-reports/recipient-options'),
      ]);
      setConfig({ ...emptyConfig, ...(configResponse.config || {}) });
      setRecipientOptions(recipients);
      if (reportRows[0]) await openReport(reportRows[0].id);
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function openReport(reportId) {
    setDetailLoading(true);
    try {
      setSelectedReport(await api.get(`/daily-progress-reports/${reportId}`));
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }

  async function resendReport(reportId) {
    try {
      const result = await api.post(`/daily-progress-reports/${reportId}/resend`);
      showToast(`Report re-sent. Sent: ${result.sent}, Failed: ${result.failed}`, { severity: result.failed ? 'warning' : 'success' });
      await openReport(reportId);
      await loadReports();
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    }
  }

  async function saveConfig() {
    try {
      const saved = await api.put('/daily-progress-reports/config', config);
      setConfig({ ...emptyConfig, ...saved });
      showToast('Daily report configuration saved.', { severity: 'success' });
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    }
  }

  async function generateReportNow() {
    setGeneratingNow(true);
    try {
      const report = await api.post('/daily-progress-reports/generate');
      showToast('Daily progress report generated and emailed.', { severity: 'success' });
      await loadReports();
      await openReport(report.id);
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    } finally {
      setGeneratingNow(false);
    }
  }

  const latestSummary = useMemo(() => reports[0]?.summary || {}, [reports]);

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <Page maxWidth={1480}>
      <PageHeader
        eyebrow="MANAGEMENT REPORTING"
        title="Daily Progress Reports"
        description="Automated daily view of active requests, activity, pending actions, and delivery risks."
        actions={(
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {canConfigure && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={generatingNow ? <CircularProgress size={16} color="inherit" /> : <SendOutlinedIcon />}
                onClick={generateReportNow}
                disabled={generatingNow}
              >
                {generatingNow ? 'Generating...' : 'Generate Daily Progress Report Now'}
              </Button>
            )}
            <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={loadAll}>Refresh</Button>
            {selectedReport && <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={() => downloadReportPdf(selectedReport)}>Download PDF</Button>}
          </Stack>
        )}
      />

      {loading ? (
        <Stack sx={{ minHeight: 360, alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Stack>
      ) : (
        <Stack spacing={2.5}>
          <Grid container spacing={1.5}>
            <SummaryCard label="Active Requests" value={latestSummary.totalActiveRequests || 0} />
            <SummaryCard label="Updated Today" value={latestSummary.requestsUpdatedToday || 0} />
            <SummaryCard label="No Activity Today" value={latestSummary.requestsWithNoActivityToday || 0} />
            <SummaryCard label="Pending Action" value={latestSummary.requestsPendingAction || 0} />
            <SummaryCard label="High Priority" value={latestSummary.highPriorityRequests || 0} />
            <SummaryCard label="Overdue" value={latestSummary.overdueRequests || 0} />
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Stack spacing={2}>
                <Panel title="Historical Reports">
                  <Stack spacing={1.25}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                      <TextField label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                      <Button variant="outlined" onClick={loadReports}>Filter</Button>
                    </Stack>
                    {reports.length === 0 ? (
                      <Alert severity="info">No daily progress reports have been generated yet.</Alert>
                    ) : reports.map((report) => (
                      <ReportListItem key={report.id} report={report} selected={selectedReport?.id === report.id} onOpen={() => openReport(report.id)} />
                    ))}
                  </Stack>
                </Panel>

                <Panel title="Configuration" icon={<SettingsOutlinedIcon fontSize="small" />}>
                  <Stack spacing={1.5}>
                    <FormControlLabel
                      control={<Checkbox checked={Boolean(config.isEnabled)} disabled={!canConfigure} onChange={(event) => setConfig((current) => ({ ...current, isEnabled: event.target.checked }))} />}
                      label="Enable automated daily email"
                    />
                    <TextField label="Report Time" type="time" value={config.reportTime || '19:00'} disabled={!canConfigure} onChange={(event) => setConfig((current) => ({ ...current, reportTime: event.target.value }))} InputLabelProps={{ shrink: true }} />
                    <TextField label="Stale Request Threshold (days)" type="number" value={config.staleThresholdDays} disabled={!canConfigure} onChange={(event) => setConfig((current) => ({ ...current, staleThresholdDays: Number(event.target.value) }))} />
                    <TextField label="Overdue Threshold (days)" type="number" value={config.overdueThresholdDays} disabled={!canConfigure} onChange={(event) => setConfig((current) => ({ ...current, overdueThresholdDays: Number(event.target.value) }))} />
                    <TextField
                      select
                      label="Recipients"
                      value={config.recipientUserIds || []}
                      disabled={!canConfigure}
                      onChange={(event) => setConfig((current) => ({ ...current, recipientUserIds: typeof event.target.value === 'string' ? event.target.value.split(',').map(Number) : event.target.value }))}
                      SelectProps={{ multiple: true }}
                      helperText="Leave empty to send to all active IT Head and Project Manager users."
                    >
                      {recipientOptions.map((recipient) => (
                        <MenuItem key={recipient.id} value={recipient.id}>
                          {recipient.full_name} ({formatEnum(recipient.role_code)})
                        </MenuItem>
                      ))}
                    </TextField>
                    {canConfigure ? (
                      <Button variant="contained" onClick={saveConfig}>Save Configuration</Button>
                    ) : (
                      <Alert severity="info">Only System Admin can update report configuration.</Alert>
                    )}
                  </Stack>
                </Panel>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, lg: 8 }}>
              <Panel title="Report Detail">
                {detailLoading ? (
                  <Stack sx={{ minHeight: 260, alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Stack>
                ) : selectedReport ? (
                  <ReportDetail report={selectedReport} onResend={() => resendReport(selectedReport.id)} />
                ) : (
                  <Alert severity="info">Select a report to view details.</Alert>
                )}
              </Panel>
            </Grid>
          </Grid>
        </Stack>
      )}
    </Page>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Grid size={{ xs: 6, md: 4, lg: 2 }}>
      <Box sx={{ p: 2, borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated }}>
        <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
        <Typography variant="h4" sx={{ mt: 0.75 }}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function Panel({ title, icon, children }) {
  return (
    <Box sx={{ borderRadius: 2, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.elevated, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1.5, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        {icon}
        <Typography variant="subtitle1" fontWeight={900}>{title}</Typography>
      </Stack>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

function ReportListItem({ report, selected, onOpen }) {
  return (
    <Button
      fullWidth
      onClick={onOpen}
      sx={{
        justifyContent: 'space-between',
        textAlign: 'left',
        borderRadius: 1.5,
        border: (theme) => `1px solid ${selected ? theme.palette.primary.main : theme.custom.semantic.borderSoft}`,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        p: 1.25,
      }}
    >
      <Box>
        <Typography fontWeight={850}>{formatDate(report.report_date)}</Typography>
        <Typography variant="caption" color="text.secondary">{formatDateTime(report.generated_at)}</Typography>
      </Box>
      <StatusBadge value={report.report_status} />
    </Button>
  );
}

function ReportDetail({ report, onResend }) {
  const payload = report.payload || {};
  const requests = payload.requests || [];
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">Report Date: {payload.reportDate || formatDate(report.report_date)}</Typography>
          <Typography variant="body2" color="text.secondary">Generated {formatDateTime(report.generated_at)}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<SendOutlinedIcon />} onClick={onResend}>Re-send Report</Button>
      </Stack>

      <Divider />

      <Stack spacing={1}>
        <Typography variant="subtitle2" fontWeight={900}>Key Risks & Bottlenecks</Typography>
        {(payload.keyRisks || []).length ? payload.keyRisks.map((risk) => (
          <Alert key={risk.label} severity={risk.label.includes('Overdue') || risk.label.includes('Blocked') ? 'warning' : 'info'}>
            {risk.label}: {risk.count} request(s) {risk.requests?.length ? `(${risk.requests.join(', ')})` : ''}
          </Alert>
        )) : <Alert severity="success">No major risks identified.</Alert>}
      </Stack>

      <Stack spacing={1.25}>
        {requests.map((request) => (
          <Box key={request.id} sx={{ p: 1.5, borderRadius: 1.5, border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={900}>{request.requestId} - {request.title}</Typography>
                <Typography variant="body2" color="text.secondary">{request.department} • Developer: {request.assignedDeveloper}</Typography>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                <StatusBadge value={request.priority} />
                <StatusBadge value={request.status} />
              </Stack>
            </Stack>
            <Grid container spacing={1.25} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={900}>Today's Activity</Typography>
                {request.todayActivity?.items?.length ? (
                  <Stack component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
                    {request.todayActivity.items.slice(0, 4).map((item, index) => (
                      <Typography component="li" variant="body2" key={`${item.kind}-${index}`}>{item.kind}: {item.label} ({item.actor})</Typography>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="warning.main" fontWeight={800}>No activity recorded today.</Typography>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={900}>Pending Action</Typography>
                <Typography variant="body2">{request.pendingAction?.nextResponsiblePerson}</Typography>
                <Typography variant="body2" color="text.secondary">{request.pendingAction?.currentBottleneck}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                  {request.highlights?.map((highlight) => <Chip key={highlight} label={highlight} size="small" />)}
                </Stack>
              </Grid>
            </Grid>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
