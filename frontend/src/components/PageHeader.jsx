import { Box, Breadcrumbs, Stack, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function PageHeader({ eyebrow, title, description, actions, breadcrumbs = [] }) {
  return (
    <Box
      sx={{
        mb: { xs: 2, md: 3 },
        p: { xs: 2, sm: 2.75, md: 3.5 },
        borderRadius: { xs: 3, md: 6 },
        color: '#0B1220',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(244,248,255,0.9))',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 24px 80px rgba(15, 23, 42, 0.08)',
        border: '1px solid rgba(216,226,239,0.86)',
        position: 'relative',
        overflow: 'hidden',
        '&:before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 88% 18%, rgba(37,99,235,0.14), transparent 30%), radial-gradient(circle at 12% 10%, rgba(20,184,166,0.11), transparent 24%)',
        },
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} position="relative" sx={{ justifyContent: 'space-between', minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          {breadcrumbs.length > 0 && (
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ color: '#64748B', mb: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              {breadcrumbs.map((item) => (
                <Typography key={item} variant="caption" color="inherit">{item}</Typography>
              ))}
            </Breadcrumbs>
          )}
          {eyebrow && (
            <Typography variant="overline" sx={{ letterSpacing: '0.14em', color: '#1D4ED8', fontWeight: 900 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h3" sx={{ mt: 0.35, fontSize: { xs: 30, sm: 36, md: 44 }, overflowWrap: 'anywhere' }}>{title}</Typography>
          {description && (
            <Typography sx={{ mt: 1, maxWidth: 760, color: '#64748B', fontSize: { xs: 14, md: 16 }, overflowWrap: 'anywhere' }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              flexWrap: 'wrap',
              width: { xs: '100%', md: 'auto' },
              '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' } },
            }}
          >
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
