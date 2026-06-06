import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ChatBubbleOutlinedIcon from '@mui/icons-material/ChatBubbleOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import {
  filterNotifications,
  formatNotificationDate,
  formatRelativeTime,
  getNotificationMeta,
  groupNotificationsByDate,
  notificationFilters,
} from '../utils/notifications';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rows, setRows] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  async function load() {
    setRows(await api.get('/notifications'));
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id) {
    await api.post(`/notifications/${id}/read`);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, is_read: true } : row)));
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setRows((current) => current.map((row) => ({ ...row, is_read: true })));
  }

  const unreadCount = rows.filter((row) => !row.is_read).length;
  const filteredRows = useMemo(() => filterNotifications(rows, activeFilter, query), [rows, activeFilter, query]);
  const groupedRows = useMemo(() => groupNotificationsByDate(filteredRows), [filteredRows]);
  const groupEntries = ['Today', 'Yesterday', 'Older']
    .map((label) => [label, groupedRows[label] || []])
    .filter(([, items]) => items.length > 0);

  return (
    <Page maxWidth={1320}>
      <PageHeader
        eyebrow="NOTIFICATION CENTER"
        title="Notifications"
        description="Stay on top of approvals, assignments, reviews, and workflow updates."
        actions={(
          <Button
            variant="contained"
            startIcon={<DoneAllIcon />}
            onClick={markAllRead}
            disabled={unreadCount === 0}
            sx={{ alignSelf: { xs: 'stretch', md: 'center' }, borderRadius: 1.25 }}
          >
            Mark All Read
          </Button>
        )}
      />

      <Box
        sx={{
          borderRadius: 2,
          border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
          bgcolor: (theme) => theme.custom.semantic.elevated,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          overflow: 'hidden',
        }}
      >
        <Stack spacing={1.5} sx={{ p: { xs: 1.5, md: 2 }, borderBottom: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`, bgcolor: (theme) => theme.custom.semantic.paper }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', lg: 'center' } }}>
            <TextField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by request ID, title, or message"
              sx={{ maxWidth: { lg: 460 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.2 }}>
              {notificationFilters.map((filter) => {
                const selected = activeFilter === filter.id;
                const count = filter.id === 'ALL'
                  ? rows.length
                  : filterNotifications(rows, filter.id, '').length;
                return (
                  <Chip
                    key={filter.id}
                    label={`${filter.label} ${count ? count : ''}`.trim()}
                    onClick={() => setActiveFilter(filter.id)}
                    variant={selected ? 'filled' : 'outlined'}
                    color={selected ? 'primary' : 'default'}
                    sx={{
                      borderRadius: 1.25,
                      height: 32,
                      flexShrink: 0,
                      fontWeight: 800,
                      bgcolor: selected ? undefined : (theme) => theme.custom.semantic.paperSoft,
                    }}
                  />
                );
              })}
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {filteredRows.length} notification{filteredRows.length === 1 ? '' : 's'} shown • {unreadCount} unread
          </Typography>
        </Stack>

        <Box sx={{ p: { xs: 1.25, md: 2 }, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
          {rows.length === 0 ? (
            <NotificationEmptyState title="No notifications found" message="Workflow alerts and assignment updates will appear here." />
          ) : filteredRows.length === 0 ? (
            <NotificationEmptyState
              title={activeFilter === 'UNREAD' ? 'No unread notifications' : 'No notifications found'}
              message={activeFilter === 'UNREAD' ? "You're all caught up." : 'Try changing your filters or search terms.'}
            />
          ) : (
            <Stack spacing={2.25}>
              {groupEntries.map(([group, items]) => (
                <Box key={group}>
                  <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                    {group}
                  </Typography>
                  <Stack spacing={1}>
                    {items.map((notification) => (
                      <NotificationCenterCard
                        key={notification.id}
                        notification={notification}
                        compact={isMobile}
                        onView={() => navigate(notification.request_id ? `/requests/${notification.request_id}` : '/notifications')}
                        onMarkRead={() => markRead(notification.id)}
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Page>
  );
}

function getNotificationTone(meta, theme) {
  const isDark = theme.palette.mode === 'dark';
  const tones = {
    warning: { color: '#D97706', bg: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB', border: isDark ? 'rgba(245,158,11,0.28)' : '#FDE68A' },
    success: { color: '#16A34A', bg: isDark ? 'rgba(22,163,74,0.12)' : '#F0FDF4', border: isDark ? 'rgba(34,197,94,0.26)' : '#BBF7D0' },
    error: { color: '#DC2626', bg: isDark ? 'rgba(220,38,38,0.12)' : '#FEF2F2', border: isDark ? 'rgba(248,113,113,0.28)' : '#FECACA' },
    info: { color: '#0284C7', bg: isDark ? 'rgba(2,132,199,0.14)' : '#F0F9FF', border: isDark ? 'rgba(56,189,248,0.28)' : '#BAE6FD' },
    primary: { color: '#2563EB', bg: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF', border: isDark ? 'rgba(96,165,250,0.30)' : '#BFDBFE' },
    neutral: { color: isDark ? '#CBD5E1' : '#475569', bg: isDark ? 'rgba(148,163,184,0.10)' : '#F8FAFC', border: isDark ? 'rgba(148,163,184,0.22)' : '#E2E8F0' },
  };
  return tones[meta.tone] || tones.neutral;
}

function NotificationTypeIcon({ meta }) {
  const iconProps = { sx: { fontSize: 18 } };
  if (meta.label.includes('Approval Required')) return <AssignmentTurnedInOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Approved')) return <CheckCircleIcon {...iconProps} />;
  if (meta.label.includes('Rejected')) return <CancelOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Clarification')) return <HelpOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Assigned')) return <PersonAddAltOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Comment')) return <ChatBubbleOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Status')) return <SyncAltOutlinedIcon {...iconProps} />;
  return <InfoOutlinedIcon {...iconProps} />;
}

function NotificationCenterCard({ notification, compact, onView, onMarkRead }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  const meta = getNotificationMeta(notification);
  const tone = getNotificationTone(meta, theme);
  const unread = !notification.is_read;

  return (
    <Box
      sx={{
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: unread ? tone.border : semantic.borderSoft,
        borderLeft: unread ? `3px solid ${tone.color}` : `3px solid transparent`,
        bgcolor: unread ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.08)' : '#FFFFFF') : semantic.paper,
        transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
        '&:hover': {
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.10)' : '#FFFFFF',
          borderColor: unread ? tone.border : semantic.border,
          boxShadow: theme.palette.mode === 'dark' ? '0 12px 28px rgba(0,0,0,0.22)' : '0 12px 28px rgba(15,23,42,0.06)',
        },
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: { xs: 1.35, md: 1.6 }, alignItems: { xs: 'stretch', md: 'flex-start' } }}>
        <Stack direction="row" spacing={1.25} sx={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 1.25, display: 'grid', placeItems: 'center', flexShrink: 0, color: tone.color, bgcolor: tone.bg, border: `1px solid ${tone.border}` }}>
            <NotificationTypeIcon meta={meta} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                {unread && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.color, flexShrink: 0 }} />}
                <Typography variant="subtitle2" fontWeight={900} noWrap={!compact}>{meta.label}</Typography>
              </Stack>
              <Box sx={{ px: 0.85, py: 0.25, borderRadius: 1, color: unread ? tone.color : 'text.secondary', bgcolor: unread ? tone.bg : semantic.paperSoft, border: `1px solid ${unread ? tone.border : semantic.borderSoft}`, fontSize: 11.5, fontWeight: 850, flexShrink: 0 }}>
                {unread ? 'Unread' : 'Read'}
              </Box>
            </Stack>

            <Typography variant="body2" color="primary.main" fontWeight={880} sx={{ mt: 0.65 }}>
              {notification.request_number || 'System Notification'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, color: 'text.primary', overflowWrap: 'anywhere' }}>
              {notification.message || notification.title}
            </Typography>
            {notification.request_title && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
                {notification.request_title}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.8 }}>
              {formatNotificationDate(notification.created_at)} • {formatRelativeTime(notification.created_at)}
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'row', md: 'column' }} spacing={0.75} sx={{ alignItems: { xs: 'stretch', md: 'flex-end' }, justifyContent: 'center', minWidth: { md: 142 } }}>
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={onView} sx={{ borderRadius: 1, flex: { xs: 1, md: 'unset' } }}>
            {notification.request_id ? 'View Request' : 'Open'}
          </Button>
          {unread ? (
            <Button size="small" color="inherit" startIcon={<MarkEmailReadOutlinedIcon />} onClick={onMarkRead} sx={{ borderRadius: 1, flex: { xs: 1, md: 'unset' } }}>
              Mark Read
            </Button>
          ) : (
            <IconButton size="small" disabled sx={{ alignSelf: { md: 'flex-end' } }}>
              <MarkEmailReadOutlinedIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function NotificationEmptyState({ title, message }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 280, textAlign: 'center', px: 2 }}>
      <Box sx={{ width: 48, height: 48, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#EFF6FF', border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}` }}>
        <InfoOutlinedIcon />
      </Box>
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={360}>{message}</Typography>
    </Stack>
  );
}
