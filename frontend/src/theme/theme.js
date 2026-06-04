import { alpha, createTheme } from '@mui/material/styles';

export const designTokens = {
  spacing: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 22,
    xl: 32,
  },
  shadows: {
    card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 50px rgba(15, 23, 42, 0.07)',
    hover: '0 22px 80px rgba(15, 23, 42, 0.13)',
    inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
  },
  gradients: {
    app: 'radial-gradient(circle at 18% 8%, rgba(37, 99, 235, 0.09), transparent 26%), radial-gradient(circle at 78% 0%, rgba(20, 184, 166, 0.08), transparent 24%), linear-gradient(180deg, #FBFCFE 0%, #F4F7FB 52%, #EDF2F8 100%)',
    hero: 'linear-gradient(135deg, #07111F 0%, #0F2A4A 48%, #1D4ED8 100%)',
  },
  colors: {
    navy: '#07111F',
    blue: '#2563EB',
    emerald: '#10B981',
    amber: '#F59E0B',
    red: '#EF4444',
    slate: '#64748B',
  },
};

const lightPalette = {
  app: '#F5F7FB',
  paper: '#FFFFFF',
  paperSoft: '#F8FAFC',
  elevated: 'rgba(255,255,255,0.86)',
  text: '#0B1220',
  muted: '#667085',
  border: '#DCE5F0',
  borderSoft: '#E8EEF6',
  sidebar: '#07111F',
  sidebarMuted: 'rgba(226,232,240,0.64)',
  hero: 'linear-gradient(135deg, #07111F 0%, #10213B 48%, #1D4ED8 100%)',
};

const darkPalette = {
  app: '#0B1220',
  paper: '#111A2B',
  paperSoft: '#0F172A',
  elevated: 'rgba(17,26,43,0.86)',
  text: '#F8FAFC',
  muted: '#A7B3C5',
  border: '#24324A',
  borderSoft: '#1E293B',
  sidebar: '#070D18',
  sidebarMuted: 'rgba(203,213,225,0.66)',
  hero: 'linear-gradient(135deg, #050A12 0%, #0F172A 46%, #1D4ED8 100%)',
};

export function createRequestOpsTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const semantic = isDark ? darkPalette : lightPalette;

  return createTheme({
  palette: {
    mode,
    primary: {
      main: '#1D4ED8',
      light: '#DBEAFE',
      dark: '#07111F',
    },
    secondary: {
      main: '#14B8A6',
      light: '#CCFBF1',
      dark: '#0F766E',
    },
    info: {
      main: '#0284C7',
      light: '#E0F2FE',
    },
    background: {
      default: semantic.app,
      paper: semantic.paper,
    },
    text: {
      primary: semantic.text,
      secondary: semantic.muted,
    },
    success: {
      main: '#16A34A',
      light: '#DCFCE7',
    },
    warning: {
      main: '#F97316',
      light: '#FFEDD5',
    },
    error: {
      main: '#DC2626',
      light: '#FEE2E2',
    },
    divider: semantic.borderSoft,
    slate: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      500: '#64748B',
      700: '#334155',
      900: '#0F172A',
    },
  },
  custom: {
    semantic,
    tokens: designTokens,
  },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Arial', 'sans-serif'].join(','),
    h1: { fontWeight: 820, letterSpacing: '-0.06em', lineHeight: 0.95 },
    h2: { fontWeight: 820, letterSpacing: '-0.055em', lineHeight: 1 },
    h3: { fontWeight: 820, letterSpacing: '-0.045em', lineHeight: 1.04 },
    h4: { fontWeight: 800, letterSpacing: '-0.038em', lineHeight: 1.08 },
    h5: { fontWeight: 760, letterSpacing: '-0.028em', lineHeight: 1.18 },
    h6: { fontWeight: 760, letterSpacing: '-0.02em', lineHeight: 1.24 },
    subtitle1: { fontWeight: 680 },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 760, letterSpacing: '-0.01em' },
  },
  shape: {
    borderRadius: designTokens.radius.md,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: isDark
            ? 'radial-gradient(circle at 18% 8%, rgba(37, 99, 235, 0.16), transparent 26%), radial-gradient(circle at 78% 0%, rgba(20, 184, 166, 0.10), transparent 24%), #0B1220'
            : designTokens.gradients.app,
          color: semantic.text,
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          transition: 'background-color 220ms ease, color 220ms ease',
        },
        '::selection': {
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
        },
        '*': {
          boxSizing: 'border-box',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(226, 232, 240, 0.82)',
          boxShadow: designTokens.shadows.card,
          backgroundImage: isDark
            ? 'linear-gradient(180deg, rgba(17,26,43,0.98), rgba(15,23,42,0.92))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.92))',
          backdropFilter: 'blur(18px)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 18,
          boxShadow: 'none',
          transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease, border-color 180ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 14px 30px rgba(29, 78, 216, 0.18)',
          },
        },
        contained: {
          backgroundImage: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
        },
        outlined: {
          borderColor: '#D7DEE8',
          color: semantic.text,
          backgroundColor: alpha(semantic.paper, 0.72),
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: alpha(semantic.paper, 0.88),
          transition: 'box-shadow 160ms ease, border-color 160ms ease',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#94A3B8',
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.10)',
          },
        },
        notchedOutline: {
          borderColor: semantic.border,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: '#475569',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.075em',
          textTransform: 'uppercase',
          backgroundColor: alpha(semantic.paperSoft, 0.72),
          borderBottom: `1px solid ${semantic.borderSoft}`,
        },
        body: {
          borderBottom: `1px solid ${semantic.borderSoft}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 750,
          borderRadius: 999,
        },
      },
    },
  },
});
}

const theme = createRequestOpsTheme('light');

export default theme;
