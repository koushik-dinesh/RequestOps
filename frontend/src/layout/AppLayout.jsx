import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  Button,
  Tooltip,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SearchIcon from '@mui/icons-material/Search';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import TuneIcon from '@mui/icons-material/Tune';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ChatBubbleOutlinedIcon from '@mui/icons-material/ChatBubbleOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Bell,
  BookOpen,
  ClipboardList,
  Code2,
  Gauge,
  LogOut,
  Plus,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccess, canCreateRequest, routePermissions } from '../auth/permissions';
import { missingReportingAuthorityText, roleLabels } from '../utils/constants';
import api from '../api/client';
import { useThemeMode } from '../theme/ThemeModeProvider';
import { formatRelativeTime, getNotificationMeta } from '../utils/notifications';

const expandedWidth = 244;
const collapsedWidth = 64;
const sidebarIconSize = 20;

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/', icon: Gauge, route: '/' },
      { label: 'Requests', path: '/requests', icon: ClipboardList, route: '/requests' },
      { label: 'Organization', path: '/organization', icon: UsersRound, route: '/organization' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Developer Workload', path: '/developer-workload', icon: Gauge, route: '/developer-workload' },
      { label: 'Daily Progress Reports', path: '/daily-progress-reports', icon: ClipboardList, route: '/daily-progress-reports' },
    ],
  },
  {
    label: 'Project Management',
    items: [
      { label: 'Scope Management', path: '/project-scopes', icon: ClipboardList, route: '/project-scopes' },
      { label: 'User Stories', path: '/user-stories', icon: BookOpen, route: '/user-stories' },
      { label: 'Sprint Management', path: '/sprints', icon: Code2, route: '/sprints' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Notifications', path: '/notifications', icon: Bell, route: '/notifications' },
      { label: 'User Manual', path: '/manual', icon: BookOpen, route: '/manual' },
      { label: 'Admin', path: '/admin', icon: ShieldCheck, route: '/admin' },
    ],
  },
];

function getRoleAwareNavLabel(item, roleCode) {
  if (item.path === '/requests' && roleCode === 'EMPLOYEE') return 'My Requests';
  if (item.path === '/requests' && ['DEVELOPER', 'QA', 'UAT_APPROVER'].includes(roleCode)) return 'Assigned Requests';
  if (item.path === '/developer-workload') return 'Developer Workload';
  if (item.path === '/admin') return 'Admin Console';
  return item.label;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mode, toggleMode } = useThemeMode();
  const semantic = theme.custom.semantic;
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationAnchor, setNotificationAnchor] = useState(null);
  const [profileAnchor, setProfileAnchor] = useState(null);
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => canAccess(user?.roleCode, routePermissions[item.route] || ['*']))
        .map((item) => ({
          ...item,
          label: getRoleAwareNavLabel(item, user?.roleCode),
        })),
    }))
    .filter((group) => group.items.length > 0);
  const visibleNavItems = visibleGroups.flatMap((group) => group.items);
  const effectiveCollapsed = isMobile ? false : collapsed;
  const drawerWidth = effectiveCollapsed ? collapsedWidth : expandedWidth;
  const unreadNotifications = notifications.filter((item) => !item.is_read);
  const unreadCount = unreadNotifications.length;
  const sidebarBg = theme.palette.mode === 'dark' ? '#111827' : '#F8FAFC';
  const sidebarBorder = theme.palette.mode === 'dark' ? '#253044' : '#D8DEE8';
  const sidebarText = theme.palette.mode === 'dark' ? '#CBD5E1' : '#334155';
  const sidebarMuted = theme.palette.mode === 'dark' ? '#94A3B8' : '#64748B';
  const sidebarActiveBg = theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.14)' : '#EAF1FF';
  const sidebarHoverBg = theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.10)' : '#EEF2F7';
  const showReportingOwner = user?.roleCode && user.roleCode !== 'SYSTEM_ADMIN';
  const reportingOwner = user?.departmentHeadId === user?.id
    ? 'You are the department head'
    : user?.departmentHeadName || missingReportingAuthorityText;

  useEffect(() => {
    api.get('/notifications').then(setNotifications).catch(() => setNotifications([]));
  }, []);

  async function markNotificationRead(notificationId) {
    await api.post(`/notifications/${notificationId}/read`);
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, is_read: true } : item
    )));
  }

  function openNotification(notification) {
    setNotificationAnchor(null);
    if (!notification.is_read) {
      markNotificationRead(notification.id).catch(() => {});
    }
    navigate(notification.request_id ? `/requests/${notification.request_id}` : '/notifications');
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', width: '100%', overflowX: 'hidden' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(17,26,43,0.86)' : 'rgba(255,255,255,0.86)',
          color: 'text.primary',
          backdropFilter: 'blur(18px)',
          borderBottom: `1px solid ${semantic.borderSoft}`,
          boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
        }}
      >
        <Toolbar sx={{ minHeight: 64, gap: { xs: 1, sm: 1.5, md: 2 }, px: { xs: 1.5, sm: 2, md: 3 } }}>
          <IconButton
            onClick={() => {
              if (isMobile) setMobileOpen(true);
              else setCollapsed((value) => !value);
            }}
            sx={{ border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper, flexShrink: 0 }}
            aria-label={isMobile ? 'Open navigation' : 'Toggle navigation'}
          >
            {effectiveCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </IconButton>
          <Box
            sx={{
              flex: 1,
              maxWidth: 620,
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 1,
              px: 1.85,
              py: 1,
              borderRadius: 999,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.82)' : 'rgba(248,250,252,0.82)',
              border: `1px solid ${semantic.borderSoft}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
              minWidth: 0,
            }}
          >
            <SearchIcon color="action" fontSize="small" />
            <InputBase placeholder="Search requests, people, departments..." fullWidth />
            <TuneIcon color="action" fontSize="small" />
          </Box>
          <Box sx={{ display: { xs: 'block', sm: 'none' }, flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 850 }} noWrap>RequestOps</Typography>
          </Box>
          <IconButton onClick={(event) => setNotificationAnchor(event.currentTarget)}>
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <IconButton onClick={toggleMode} sx={{ border: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper }}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: { xs: 0, md: drawerWidth },
          flexShrink: 0,
          transition: 'width 220ms ease',
          [`& .MuiDrawer-paper`]: {
            width: { xs: 'min(86vw, 304px)', md: drawerWidth },
            boxSizing: 'border-box',
            transition: 'width 220ms ease',
            borderRight: `1px solid ${sidebarBorder}`,
            bgcolor: sidebarBg,
            backgroundImage: 'none',
            top: { xs: 64, md: 0 },
            height: { xs: 'calc(100dvh - 64px)', md: '100dvh' },
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', px: 1, py: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              height: 58,
              px: effectiveCollapsed ? 0 : 0.75,
              alignItems: 'center',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              mb: 0.25,
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                bgcolor: '#1D4ED8',
              }}
            >
              V
            </Box>
            {!effectiveCollapsed && (
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: theme.palette.text.primary, fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                  RequestOps
                </Typography>
                <Typography sx={{ color: sidebarMuted, fontSize: 11, lineHeight: 1.2 }}>
                  Violin Enterprise
                </Typography>
              </Box>
            )}
          </Stack>

          {!effectiveCollapsed && canCreateRequest(user?.roleCode) && (
            <Button
              component={Link}
              to="/requests/new"
              onClick={() => isMobile && setMobileOpen(false)}
              startIcon={<Plus size={16} strokeWidth={2} />}
              variant="contained"
              sx={{
                justifyContent: 'flex-start',
                height: 34,
                mt: 0.75,
                mb: 1,
                px: 1.25,
                borderRadius: 1,
                fontSize: 12.5,
                fontWeight: 700,
                '&:hover': {
                  transform: 'none',
                },
              }}
            >
              New Request
            </Button>
          )}

          <Divider sx={{ borderColor: sidebarBorder, mb: 1 }} />

          <List sx={{ py: 0, flex: '0 0 auto' }}>
            <Stack spacing={0.15}>
              {visibleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  item={item}
                  selected={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
                  collapsed={effectiveCollapsed}
                  sidebarText={sidebarText}
                  sidebarMuted={sidebarMuted}
                  sidebarHoverBg={sidebarHoverBg}
                  sidebarActiveBg={sidebarActiveBg}
                  onNavigate={() => isMobile && setMobileOpen(false)}
                />
              ))}
            </Stack>
          </List>

          <Box sx={{ mt: 'auto' }}>
            <Divider sx={{ borderColor: sidebarBorder, mb: 0.75 }} />
            <Stack spacing={0.15}>
              <ListItemButton
                onClick={logout}
                sx={{
                  minHeight: 36,
                  borderRadius: 1.5,
                  justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                  px: effectiveCollapsed ? 0 : 1,
                  gap: effectiveCollapsed ? 0 : 1.1,
                  color: sidebarText,
                  '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(239,68,68,0.12)' : '#FEE2E2', color: '#DC2626' },
                }}
              >
                <LogOut size={sidebarIconSize} strokeWidth={2} />
                {!effectiveCollapsed && <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Logout</Typography>}
              </ListItemButton>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              onClick={(event) => setProfileAnchor(event.currentTarget)}
              sx={{
                mt: 0.75,
                px: effectiveCollapsed ? 0 : 0.75,
                py: 0.65,
                minHeight: 44,
                borderRadius: 1.5,
                cursor: 'pointer',
                alignItems: 'center',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                '&:hover': { bgcolor: sidebarHoverBg },
              }}
            >
              <Avatar sx={{ width: 28, height: 28, bgcolor: '#1D4ED8', fontSize: 12, fontWeight: 800 }}>
                {user?.fullName?.[0]}
              </Avatar>
              {!effectiveCollapsed && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: theme.palette.text.primary, fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }} noWrap>
                    {user?.fullName}
                  </Typography>
                  <Typography sx={{ color: sidebarMuted, fontSize: 11, lineHeight: 1.25 }} noWrap>
                    {roleLabels[user?.roleCode] || user?.roleCode}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3, xl: 4 },
          minHeight: '100dvh',
          maxWidth: '1680px',
          mx: 'auto',
          width: '100%',
          minWidth: 0,
        }}
      >
        <Toolbar sx={{ minHeight: 64 }} />
        <Outlet />
      </Box>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        MenuListProps={{ sx: { p: 0 } }}
        PaperProps={{
          sx: {
            width: { xs: 'calc(100vw - 24px)', sm: 430 },
            maxWidth: 'calc(100vw - 24px)',
            borderRadius: 2,
            mt: 1,
            overflow: 'hidden',
            border: `1px solid ${semantic.borderSoft}`,
            bgcolor: semantic.elevated,
            backgroundImage: 'none',
            boxShadow: theme.palette.mode === 'dark' ? '0 22px 70px rgba(0,0,0,0.42)' : '0 22px 70px rgba(15,23,42,0.16)',
          },
        }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={900}>Notifications</Typography>
            <Typography variant="caption" color="text.secondary">{unreadCount} unread item{unreadCount === 1 ? '' : 's'}</Typography>
          </Box>
          {unreadCount > 0 && (
            <Box sx={{ px: 1, py: 0.35, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.18)' : '#EFF6FF', color: 'primary.main', fontSize: 12, fontWeight: 850 }}>
              Live
            </Box>
          )}
        </Stack>
        <Stack spacing={0.75} sx={{ p: 1, maxHeight: 430, overflowY: 'auto', bgcolor: semantic.paperSoft }}>
          {unreadNotifications.length === 0 ? (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Typography variant="subtitle2" fontWeight={850}>You&apos;re all caught up</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>No pending notifications need your attention.</Typography>
            </Box>
          ) : unreadNotifications.slice(0, 8).map((item) => (
            <NotificationDropdownItem
              key={item.id}
              notification={item}
              onOpen={() => openNotification(item)}
              onMarkRead={() => markNotificationRead(item.id)}
            />
          ))}
        </Stack>
        <Box sx={{ p: 1, borderTop: `1px solid ${semantic.borderSoft}`, bgcolor: semantic.paper }}>
          <Button
            fullWidth
            variant="text"
            onClick={() => {
              setNotificationAnchor(null);
              navigate('/notifications');
            }}
            sx={{ borderRadius: 1.25, justifyContent: 'center' }}
          >
            View Notification Center
          </Button>
        </Box>
      </Menu>

      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        PaperProps={{ sx: { width: { xs: 'calc(100vw - 24px)', sm: 320 }, maxWidth: 'calc(100vw - 24px)', borderRadius: 3, mt: 1 } }}
      >
        <Box px={2} py={1.5}>
          <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>{user?.fullName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user?.email}</Typography>
          {showReportingOwner && (
            <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
              <Typography variant="caption" color="text.secondary" fontWeight={800}>Reports to</Typography>
              <Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{reportingOwner}</Typography>
              {user?.departmentHeadEmail && user?.departmentHeadId !== user?.id && (
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user.departmentHeadEmail}</Typography>
              )}
            </Box>
          )}
        </Box>
        <Divider />
        <MenuItem onClick={() => navigate('/')}>Dashboard</MenuItem>
        <MenuItem onClick={logout}>Logout</MenuItem>
      </Menu>
    </Box>
  );
}

function getNotificationTone(meta, theme) {
  const isDark = theme.palette.mode === 'dark';
  const tones = {
    warning: { color: '#D97706', bg: isDark ? 'rgba(245,158,11,0.14)' : '#FFFBEB', border: isDark ? 'rgba(245,158,11,0.28)' : '#FDE68A' },
    success: { color: '#16A34A', bg: isDark ? 'rgba(22,163,74,0.14)' : '#F0FDF4', border: isDark ? 'rgba(34,197,94,0.26)' : '#BBF7D0' },
    error: { color: '#DC2626', bg: isDark ? 'rgba(220,38,38,0.14)' : '#FEF2F2', border: isDark ? 'rgba(248,113,113,0.28)' : '#FECACA' },
    info: { color: '#0284C7', bg: isDark ? 'rgba(2,132,199,0.16)' : '#F0F9FF', border: isDark ? 'rgba(56,189,248,0.28)' : '#BAE6FD' },
    primary: { color: '#2563EB', bg: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF', border: isDark ? 'rgba(96,165,250,0.30)' : '#BFDBFE' },
    neutral: { color: isDark ? '#CBD5E1' : '#475569', bg: isDark ? 'rgba(148,163,184,0.12)' : '#F8FAFC', border: isDark ? 'rgba(148,163,184,0.22)' : '#E2E8F0' },
  };
  return tones[meta.tone] || tones.neutral;
}

function NotificationTypeIcon({ meta }) {
  const iconProps = { sx: { fontSize: 17 } };
  if (meta.label.includes('Approval Required')) return <AssignmentTurnedInOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Approved')) return <CheckCircleIcon {...iconProps} />;
  if (meta.label.includes('Rejected')) return <CancelOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Clarification')) return <HelpOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Assigned')) return <PersonAddAltOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Comment')) return <ChatBubbleOutlinedIcon {...iconProps} />;
  if (meta.label.includes('Status')) return <SyncAltOutlinedIcon {...iconProps} />;
  return <InfoOutlinedIcon {...iconProps} />;
}

function NotificationDropdownItem({ notification, onOpen, onMarkRead }) {
  const theme = useTheme();
  const semantic = theme.custom.semantic;
  const meta = getNotificationMeta(notification);
  const tone = getNotificationTone(meta, theme);
  const unread = !notification.is_read;

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        width: '100%',
        textAlign: 'left',
        border: '1px solid',
        borderColor: unread ? tone.border : semantic.borderSoft,
        borderLeft: unread ? `3px solid ${tone.color}` : `3px solid transparent`,
        borderRadius: 1.5,
        p: 1.15,
        bgcolor: unread ? (theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.09)' : '#FFFFFF') : semantic.paper,
        color: 'text.primary',
        cursor: 'pointer',
        transition: 'background-color 140ms ease, border-color 140ms ease',
        '&:hover': {
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.10)' : '#F8FAFC',
          borderColor: unread ? tone.border : semantic.border,
        },
      }}
    >
      <Stack direction="row" spacing={1.15} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ width: 30, height: 30, borderRadius: 1.25, display: 'grid', placeItems: 'center', flexShrink: 0, color: tone.color, bgcolor: tone.bg, border: `1px solid ${tone.border}` }}>
          <NotificationTypeIcon meta={meta} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
            <Typography variant="body2" fontWeight={880} noWrap>{meta.label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{formatRelativeTime(notification.created_at)}</Typography>
          </Stack>
          <Typography variant="caption" color="primary.main" fontWeight={850} sx={{ display: 'block', mt: 0.2 }}>
            {notification.request_number || 'System'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.15, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {notification.message || notification.title}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.65, justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary" noWrap>{notification.title}</Typography>
            {unread ? (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.color }} />
                <Typography
                  component="span"
                  variant="caption"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkRead();
                  }}
                  sx={{ color: 'primary.main', fontWeight: 850 }}
                >
                  Mark read
                </Typography>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Read</Typography>
            )}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function SidebarNavItem({
  item,
  selected,
  collapsed,
  sidebarText,
  sidebarMuted,
  sidebarHoverBg,
  sidebarActiveBg,
  onNavigate,
}) {
  const Icon = item.icon;
  const navButton = (
    <ListItemButton
      component={Link}
      to={item.path}
      onClick={onNavigate}
      selected={selected}
      sx={{
        height: 44,
        minHeight: 44,
        borderRadius: 1.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
        px: collapsed ? 0 : 1,
        gap: collapsed ? 0 : 1.15,
        color: selected ? 'primary.main' : sidebarText,
        position: 'relative',
        transition: 'background-color 140ms ease, color 140ms ease',
        '&:before': !collapsed ? {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 9,
          bottom: 9,
          width: 2,
          borderRadius: 999,
          bgcolor: selected ? 'primary.main' : 'transparent',
        } : {},
        '&.Mui-selected': {
          bgcolor: sidebarActiveBg,
          '&:hover': { bgcolor: sidebarActiveBg },
        },
        '&:hover': {
          bgcolor: selected ? sidebarActiveBg : sidebarHoverBg,
        },
      }}
    >
      <Box
        sx={{
          width: 24,
          display: 'grid',
          placeItems: 'center',
          color: selected ? 'primary.main' : sidebarMuted,
        }}
      >
        <Icon size={sidebarIconSize} strokeWidth={2} />
      </Box>
      {!collapsed && (
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: selected ? 700 : 560,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </Typography>
      )}
    </ListItemButton>
  );

  return collapsed ? (
    <Tooltip title={item.label} placement="right">
      {navButton}
    </Tooltip>
  ) : navButton;
}
