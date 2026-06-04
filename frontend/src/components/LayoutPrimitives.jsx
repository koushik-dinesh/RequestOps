import { Box, Stack } from '@mui/material';

export function Page({ children, maxWidth = 1440 }) {
  return (
    <Stack
      spacing={{ xs: 2, md: 3, lg: 4 }}
      sx={{
        width: '100%',
        maxWidth,
        mx: 'auto',
        minWidth: 0,
        animation: 'pageIn 220ms ease both',
        '@keyframes pageIn': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {children}
    </Stack>
  );
}

export function PageSection({ children, compact = false }) {
  return (
    <Box sx={{ display: 'grid', gap: compact ? { xs: 2, md: 2.5 } : { xs: 2.5, md: 3 } }}>
      {children}
    </Box>
  );
}

export function ResponsiveToolbar({ children, sx, ...props }) {
  return (
    <Stack
      {...props}
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 1.5, md: 2 }}
      sx={{
        width: '100%',
        minWidth: 0,
        alignItems: { xs: 'stretch', md: 'center' },
        '& > .MuiTextField-root': {
          width: { xs: '100%' },
        },
        '& > .MuiButton-root': {
          width: { xs: '100%', md: 'auto' },
        },
        ...sx,
      }}
    >
      {children}
    </Stack>
  );
}
