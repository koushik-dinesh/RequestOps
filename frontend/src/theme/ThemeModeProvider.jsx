import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createRequestOpsTheme } from './theme';

const ThemeModeContext = createContext(null);

export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('requestops.theme') || 'light');

  useEffect(() => {
    localStorage.setItem('requestops.theme', mode);
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const theme = useMemo(() => createRequestOpsTheme(mode), [mode]);
  const value = useMemo(() => ({
    mode,
    toggleMode: () => setMode((current) => (current === 'light' ? 'dark' : 'light')),
    setMode,
  }), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return context;
}
