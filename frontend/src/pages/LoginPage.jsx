import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useThemeMode } from '../theme/ThemeModeProvider';

const workflowItems = [
  { label: 'Requests', icon: <AccountTreeRoundedIcon /> },
  { label: 'Approvals', icon: <FactCheckRoundedIcon /> },
  { label: 'Work In Progress', icon: <CodeRoundedIcon /> },
  { label: 'Review & Validation', icon: <ScienceRoundedIcon /> },
  { label: 'Completion', icon: <RocketLaunchRoundedIcon /> },
];

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const theme = useTheme();
  const { mode, toggleMode } = useThemeMode();
  const semantic = theme.custom.semantic;
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setInfo('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  function handleForgotPassword(event) {
    event.preventDefault();
    setError('');
    setInfo('Please contact your RequestOps system administrator to reset your password.');
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '42% 58%', xl: '40% 60%' },
        bgcolor: 'background.default',
        color: 'text.primary',
        transition: 'background-color 220ms ease, color 220ms ease',
      }}
    >
      <Box
        sx={{
          minHeight: { xs: '100vh', md: 'auto' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 3, sm: 5, lg: 7 },
          py: { xs: 5, md: 7 },
          borderRight: { md: `1px solid ${semantic.borderSoft}` },
          bgcolor: semantic.elevated,
          backdropFilter: 'blur(18px)',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 430 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: { xs: 5, md: 7 }, minWidth: 0 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.75,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  background: 'linear-gradient(135deg, #07111F, #1D4ED8)',
                  boxShadow: '0 16px 36px rgba(29, 78, 216, 0.22)',
                }}
              >
                V
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ lineHeight: 1 }}>RequestOps</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>Software Request Management Platform</Typography>
              </Box>
            </Stack>
            <IconButton
              aria-label="Toggle theme"
              onClick={toggleMode}
              sx={{
                border: `1px solid ${semantic.border}`,
                bgcolor: semantic.paper,
                '&:hover': { bgcolor: semantic.paperSoft },
              }}
            >
              {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
            </IconButton>
          </Stack>

          <Box sx={{ mb: 4 }}>
            <Typography variant="h4">Welcome back</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Sign in to continue.</Typography>
          </Box>

          <Stack component="form" spacing={2.25} onSubmit={handleSubmit}>
            {error && <Alert severity="error">{error}</Alert>}
            {info && <Alert severity="info">{info}</Alert>}
            <TextField
              label="Company email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              fullWidth
              size="medium"
              autoComplete="email"
              InputProps={{
                startAdornment: <MailOutlineRoundedIcon sx={{ mr: 1.2, color: 'text.secondary' }} fontSize="small" />,
              }}
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
              size="medium"
              autoComplete="current-password"
              InputProps={{
                startAdornment: <LockRoundedIcon sx={{ mr: 1.2, color: 'text.secondary' }} fontSize="small" />,
              }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 0 }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
              <Link component={RouterLink} to="/register" underline="hover" variant="body2">
                Register for access
              </Link>
              <Link href="#" underline="hover" variant="body2" onClick={handleForgotPassword}>
                Forgot password?
              </Link>
            </Stack>
            <Button
              type="submit"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ minHeight: 50, borderRadius: 3 }}
            >
              Sign in
            </Button>
          </Stack>

        </Box>
      </Box>

      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          p: { md: 5, lg: 8 },
          color: '#FFFFFF',
          background: mode === 'dark'
            ? 'radial-gradient(circle at 72% 18%, rgba(37,99,235,0.38), transparent 28%), radial-gradient(circle at 18% 76%, rgba(20,184,166,0.24), transparent 32%), linear-gradient(135deg, #050A12 0%, #0F172A 54%, #13284C 100%)'
            : 'radial-gradient(circle at 72% 18%, rgba(37,99,235,0.34), transparent 28%), radial-gradient(circle at 18% 76%, rgba(20,184,166,0.22), transparent 32%), linear-gradient(135deg, #07111F 0%, #10213B 54%, #1D4ED8 100%)',
          '&:before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            opacity: 0.18,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
            maskImage: 'radial-gradient(circle at center, black, transparent 74%)',
          },
        }}
      >
        <Box
          sx={{
            width: 'min(760px, 100%)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Stack spacing={3.5}>
            <Stack spacing={0.75}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 850, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Request lifecycle
              </Typography>
              <Typography variant="h4" sx={{ maxWidth: 520 }}>
                Intake, approval, delivery and closure in one controlled workspace.
              </Typography>
            </Stack>

            <Box
              sx={{
                p: { md: 3, lg: 4 },
                borderRadius: 6,
                bgcolor: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.16)',
                boxShadow: '0 34px 100px rgba(0,0,0,0.26)',
                backdropFilter: 'blur(18px)',
              }}
            >
              <Stack spacing={2.2}>
                {workflowItems.map((item, index) => (
                  <Stack
                    key={item.label}
                    direction="row"
                    spacing={2}
                    sx={{
                      alignItems: 'center',
                      p: 1.8,
                      borderRadius: 4,
                      bgcolor: index === 1 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      animation: `loginFloat 5s ease-in-out ${index * 0.2}s infinite`,
                      '@keyframes loginFloat': {
                        '0%, 100%': { transform: 'translateY(0)' },
                        '50%': { transform: 'translateY(-4px)' },
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 3,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#FFFFFF',
                        bgcolor: index === 1 ? 'rgba(96,165,250,0.42)' : 'rgba(255,255,255,0.12)',
                      }}
                    >
                      {item.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={850}>{item.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                        {index === 0 && 'Business demand captured'}
                        {index === 1 && 'Role-aware review'}
                        {index === 2 && 'Assigned execution'}
                        {index === 3 && 'Validation tracked'}
                        {index === 4 && 'Audited closure'}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        bgcolor: index <= 2 ? '#34D399' : 'rgba(255,255,255,0.34)',
                        boxShadow: index <= 2 ? '0 0 0 5px rgba(52,211,153,0.12)' : 'none',
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Stack direction="row" spacing={2}>
              {['Requests', 'Approvals', 'Delivery'].map((label) => (
                <Box key={label} sx={{ px: 2, py: 1, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 800 }}>{label}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
