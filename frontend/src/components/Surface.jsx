import { Box, Stack, Typography } from '@mui/material';

export function SectionCard({ title, subtitle, action, children, sx }) {
  return (
    <Box
      sx={{
        borderRadius: { xs: 3, md: 5 },
        overflow: 'hidden',
        border: '1px solid rgba(216, 226, 239, 0.88)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.9))',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 22px 70px rgba(15,23,42,0.07)',
        backdropFilter: 'blur(20px)',
        ...sx,
      }}
    >
        {(title || action) && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, px: { xs: 2, md: 3.25 }, py: { xs: 1.75, md: 2.75 }, borderBottom: '1px solid rgba(226,232,240,0.82)' }}
          >
            <Box sx={{ minWidth: 0 }}>
              {title && <Typography variant="h6" sx={{ letterSpacing: '-0.025em', overflowWrap: 'anywhere' }}>{title}</Typography>}
              {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>{subtitle}</Typography>}
            </Box>
            {action}
          </Stack>
        )}
        <div>{children}</div>
    </Box>
  );
}

export function MetricCard({ label, value, icon, accent = '#2563EB', trend = 'Live', caption, progress }) {
  return (
    <Box
      sx={{
        borderRadius: { xs: 3, md: 5 },
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(216, 226, 239, 0.9)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.9))',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 20px 60px rgba(15,23,42,0.07)',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        '&:before': {
          content: '""',
          position: 'absolute',
          inset: '0 0 auto 0',
          height: 3,
          background: `linear-gradient(90deg, ${accent}, rgba(20,184,166,0.7))`,
        },
        '&:hover': {
          transform: 'translateY(-5px)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.14)',
        },
      }}
    >
      <Box sx={{ p: { xs: 2, md: 2.75 } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</Typography>
            <Typography variant="h3" sx={{ mt: 1.1, color: 'text.primary' }}>{value}</Typography>
          </Box>
          <Stack
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 3,
              color: accent,
              bgcolor: `${accent}12`,
              border: `1px solid ${accent}24`,
            }}
          >
            {icon}
          </Stack>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 2.2 }}>
          {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
          <Typography variant="caption" fontWeight={850} color={accent}>{trend}</Typography>
        </Stack>
        {typeof progress === 'number' && (
          <div
            style={{
              height: 6,
              marginTop: 14,
              borderRadius: 999,
              background: '#E2E8F0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(progress, 100)}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${accent}, #14B8A6)`,
              }}
            />
          </div>
        )}
      </Box>
    </Box>
  );
}
