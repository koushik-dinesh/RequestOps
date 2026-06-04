import { useEffect, useState } from 'react';
import { Avatar, Box, Button, Stack, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { SectionCard } from '../components/Surface';
import EmptyState from '../components/EmptyState';
import { Page } from '../components/LayoutPrimitives';

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);

  async function load() {
    setRows(await api.get('/notifications'));
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id) {
    await api.post(`/notifications/${id}/read`);
    await load();
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    await load();
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Notification Center"
        title="Notifications"
        description="Stay on top of approvals, assignments, review updates, and final approval actions."
        breadcrumbs={['Home', 'Notifications']}
        actions={<Button variant="contained" startIcon={<DoneAllIcon />} onClick={markAllRead}>Mark All Read</Button>}
      />
      <SectionCard title="Inbox" subtitle={`${rows.filter((row) => !row.is_read).length} unread notifications`}>
        <Stack spacing={1.5} sx={{ p: { xs: 1.25, md: 2.5 } }}>
          {rows.length === 0 ? (
            <EmptyState title="No notifications" message="Workflow alerts and assignment updates will appear here." />
          ) : rows.map((row) => (
            <Box
              key={row.id}
              sx={{
                p: 2,
                borderRadius: 4,
                border: '1px solid',
                borderColor: (theme) => row.is_read ? theme.custom.semantic.borderSoft : theme.palette.primary.light,
                bgcolor: (theme) => row.is_read ? theme.custom.semantic.paper : (theme.palette.mode === 'dark' ? 'rgba(29,78,216,0.13)' : '#EFF6FF'),
                transition: 'transform 160ms ease, box-shadow 160ms ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 45px rgba(15,23,42,0.08)' },
              }}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', md: 'center' } }}>
                <Avatar sx={{ bgcolor: (theme) => row.is_read ? theme.custom.semantic.paperSoft : theme.palette.primary.main, color: row.is_read ? 'text.secondary' : '#FFFFFF' }}>
                  <NotificationsActiveIcon />
                </Avatar>
                <Box flex={1} minWidth={0}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    {!row.is_read && <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: 'primary.main' }} />}
                    <Typography fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography>
                  </Stack>
                  <Typography color="text.secondary" sx={{ mt: 0.4, overflowWrap: 'anywhere' }}>{row.message}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{row.request_number || 'System'} - {row.created_at}</Typography>
                </Box>
                {!row.is_read && <Button variant="outlined" onClick={() => markRead(row.id)} sx={{ width: { xs: '100%', md: 'auto' } }}>Mark Read</Button>}
              </Stack>
            </Box>
          ))}
        </Stack>
      </SectionCard>
    </Page>
  );
}
