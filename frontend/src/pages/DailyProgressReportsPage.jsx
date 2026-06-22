import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';
import { formatEnum } from '../utils/constants';

const emptyConfig = {
  isEnabled: true,
  reportTime: '19:00',
  scheduleDays: [0, 1, 2, 3, 4, 5, 6],
  recipientUserIds: [],
  staleThresholdDays: 3,
  overdueThresholdDays: 7,
};

const ALL_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_SCHEDULE_DAYS = [0, 1, 2, 3, 4];
const WEEKEND_SCHEDULE_DAYS = [5, 6];

const SCHEDULE_DAY_OPTIONS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

const SCHEDULE_PRESETS = [
  { id: 'ALL', label: 'All Days', days: ALL_SCHEDULE_DAYS },
  { id: 'WEEKDAYS', label: 'Weekdays (Mon–Fri)', days: WEEKDAY_SCHEDULE_DAYS },
  { id: 'WEEKENDS', label: 'Weekends Only', days: WEEKEND_SCHEDULE_DAYS },
  { id: 'CUSTOM', label: 'Custom Days', days: null },
];

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function detectSchedulePreset(days = []) {
  const normalized = [...days].sort((a, b) => a - b);
  if (arraysEqual(normalized, ALL_SCHEDULE_DAYS)) return 'ALL';
  if (arraysEqual(normalized, WEEKDAY_SCHEDULE_DAYS)) return 'WEEKDAYS';
  if (arraysEqual(normalized, WEEKEND_SCHEDULE_DAYS)) return 'WEEKENDS';
  return 'CUSTOM';
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DailyProgressReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [config, setConfig] = useState(emptyConfig);
  const [schedulePreset, setSchedulePreset] = useState('ALL');
  const [recipientOptions, setRecipientOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingNow, setGeneratingNow] = useState(false);

  async function loadConfig() {
    setLoading(true);
    try {
      const [configResponse, recipients] = await Promise.all([
        api.get('/daily-progress-reports/config'),
        api.get('/daily-progress-reports/recipient-options'),
      ]);
      const nextConfig = { ...emptyConfig, ...(configResponse.config || {}) };
      setConfig(nextConfig);
      setSchedulePreset(detectSchedulePreset(nextConfig.scheduleDays));
      setRecipientOptions(recipients);
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function applySchedulePreset(presetId) {
    setSchedulePreset(presetId);
    const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
    if (preset?.days) {
      setConfig((current) => ({ ...current, scheduleDays: [...preset.days] }));
    }
  }

  function toggleScheduleDay(day) {
    setSchedulePreset('CUSTOM');
    setConfig((current) => {
      const selected = new Set(current.scheduleDays || []);
      if (selected.has(day)) selected.delete(day);
      else selected.add(day);
      return { ...current, scheduleDays: [...selected].sort((a, b) => a - b) };
    });
  }

  async function saveConfig() {
    if (!(config.scheduleDays || []).length) {
      showToast('Select at least one day for automated report delivery.', { severity: 'warning' });
      return;
    }
    try {
      const saved = await api.put('/daily-progress-reports/config', config);
      const nextConfig = { ...emptyConfig, ...saved };
      setConfig(nextConfig);
      setSchedulePreset(detectSchedulePreset(nextConfig.scheduleDays));
      showToast('Daily report configuration saved.', { severity: 'success' });
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    }
  }

  async function generateReportNow() {
    setGeneratingNow(true);
    try {
      await api.post('/daily-progress-reports/generate');
      showToast('Daily progress report generated and emailed.', { severity: 'success' });
    } catch (err) {
      showToast(err.message, { severity: 'error' });
    } finally {
      setGeneratingNow(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadConfig();
  }, [user?.roleCode]);

  return (
    <Page maxWidth={920}>
      <PageHeader
        eyebrow="SYSTEM ADMIN"
        title="Daily Progress Reports"
        description="Configure automated report generation, delivery schedule, and recipients."
        actions={(
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={generatingNow ? <CircularProgress size={16} color="inherit" /> : <SendOutlinedIcon />}
              onClick={generateReportNow}
              disabled={generatingNow}
            >
              {generatingNow ? 'Generating...' : 'Generate Report Now'}
            </Button>
            <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={loadConfig}>Refresh</Button>
          </Stack>
        )}
      />

      {loading ? (
        <Stack sx={{ minHeight: 360, alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Stack>
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Panel title="Report Configuration" icon={<SettingsOutlinedIcon fontSize="small" />}>
              <Stack spacing={1.5}>
                <Alert severity="info">
                  Reports are generated automatically based on the schedule below and delivered by email to the selected recipients.
                  {config.updatedAt ? ` Last updated ${formatDateTime(config.updatedAt)}.` : ''}
                </Alert>
                <FormControlLabel
                  control={<Checkbox checked={Boolean(config.isEnabled)} onChange={(event) => setConfig((current) => ({ ...current, isEnabled: event.target.checked }))} />}
                  label="Enable automated daily report generation"
                />
                <TextField
                  label="Report Sending Time"
                  type="time"
                  value={config.reportTime || '19:00'}
                  onChange={(event) => setConfig((current) => ({ ...current, reportTime: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  helperText="Reports are sent once per day after this time on the configured schedule days."
                />
                <TextField
                  select
                  label="Schedule Days"
                  value={schedulePreset}
                  onChange={(event) => applySchedulePreset(event.target.value)}
                  helperText="Choose when automated reports should be generated and emailed."
                >
                  {SCHEDULE_PRESETS.map((preset) => (
                    <MenuItem key={preset.id} value={preset.id}>{preset.label}</MenuItem>
                  ))}
                </TextField>
                {schedulePreset === 'CUSTOM' && (
                  <Stack spacing={0.75}>
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>Select custom days</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                      {SCHEDULE_DAY_OPTIONS.map((day) => {
                        const selected = (config.scheduleDays || []).includes(day.value);
                        return (
                          <Chip
                            key={day.value}
                            label={day.label}
                            clickable
                            color={selected ? 'primary' : 'default'}
                            variant={selected ? 'filled' : 'outlined'}
                            onClick={() => toggleScheduleDay(day.value)}
                          />
                        );
                      })}
                    </Stack>
                  </Stack>
                )}
                <TextField label="Stale Request Threshold (days)" type="number" value={config.staleThresholdDays} onChange={(event) => setConfig((current) => ({ ...current, staleThresholdDays: Number(event.target.value) }))} />
                <TextField label="Overdue Threshold (days)" type="number" value={config.overdueThresholdDays} onChange={(event) => setConfig((current) => ({ ...current, overdueThresholdDays: Number(event.target.value) }))} />
                <TextField
                  select
                  label="Recipients"
                  value={config.recipientUserIds || []}
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
                <Button variant="contained" onClick={saveConfig} sx={{ alignSelf: 'flex-start' }}>Save Configuration</Button>
              </Stack>
            </Panel>
          </Grid>
        </Grid>
      )}
    </Page>
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
