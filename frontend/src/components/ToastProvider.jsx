import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [toast, setToast] = useState({
    open: false,
    message: '',
    severity: 'success',
    autoHideDuration: 3800,
  });

  const hideToast = useCallback(() => {
    setToast((current) => ({ ...current, open: false }));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    setToast({
      open: true,
      message,
      severity: options.severity || 'success',
      autoHideDuration: options.autoHideDuration ?? 3800,
    });
  }, []);

  const value = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.autoHideDuration}
        onClose={hideToast}
        anchorOrigin={isMobile ? { vertical: 'bottom', horizontal: 'center' } : { vertical: 'top', horizontal: 'right' }}
        sx={{
          position: 'fixed',
          zIndex: (currentTheme) => currentTheme.zIndex.modal + 500,
          top: { xs: 'auto', sm: 24 },
          bottom: { xs: 24, sm: 'auto' },
          left: { xs: 16, sm: 'auto' },
          right: { xs: 16, sm: 24 },
          '& .MuiSnackbarContent-root, & .MuiAlert-root': {
            width: { xs: '100%', sm: 420 },
            maxWidth: { xs: 'calc(100vw - 32px)', sm: 420 },
            boxShadow: (currentTheme) => currentTheme.custom.tokens.shadows.hover,
          },
        }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={hideToast}>
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return context;
}
