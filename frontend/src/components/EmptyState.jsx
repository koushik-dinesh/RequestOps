import { Box, Button, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export default function EmptyState({ title = 'No records yet', message = 'There is nothing to show right now.', actionLabel, onAction, icon }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', py: 6, px: 3, textAlign: 'center' }}>
      <Box
        sx={{
          width: 76,
          height: 76,
          borderRadius: 5,
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: 'primary.light',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        {icon || <InboxOutlinedIcon fontSize="large" />}
      </Box>
      <Typography variant="h6">{title}</Typography>
      <Typography color="text.secondary" maxWidth={420}>{message}</Typography>
      {actionLabel && (
        <Button variant="contained" onClick={onAction} sx={{ mt: 1 }}>
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
}
