import { Box, Breadcrumbs, Stack, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function PageHeader({ eyebrow, title, description, actions, breadcrumbs = [] }) {
  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 2,
        color: 'text.primary',
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          {breadcrumbs.length > 0 && (
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ color: 'text.secondary', mb: 0.75, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              {breadcrumbs.map((item) => (
                <Typography key={item} variant="caption" color="inherit">{item}</Typography>
              ))}
            </Breadcrumbs>
          )}
          {eyebrow && (
            <Typography variant="caption" color="primary.main" fontWeight={750} sx={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h4" sx={{ mt: 0.35, fontSize: { xs: 28, md: 34 }, overflowWrap: 'anywhere' }}>{title}</Typography>
          {typeof description === 'string' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760, overflowWrap: 'anywhere' }}>
              {description}
            </Typography>
          )}
          {description && typeof description !== 'string' && (
            <Box sx={{ mt: 0.75, maxWidth: 760 }}>
              {description}
            </Box>
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
              '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' },
            }}
          >
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
