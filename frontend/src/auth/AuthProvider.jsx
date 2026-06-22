import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

function storeTokens(tokens) {
  if (tokens?.accessToken) localStorage.setItem('requestops.accessToken', tokens.accessToken);
  if (tokens?.refreshToken) localStorage.setItem('requestops.refreshToken', tokens.refreshToken);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('requestops.accessToken')));

  const refreshSession = useCallback(async () => {
    const refreshToken = localStorage.getItem('requestops.refreshToken');
    if (!refreshToken) return false;
    try {
      const tokens = await api.post('/auth/refresh', { refreshToken });
      storeTokens(tokens);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('requestops.accessToken');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setUser(await api.get('/auth/me'));
      } catch {
        const refreshed = await refreshSession();
        if (refreshed) {
          try {
            setUser(await api.get('/auth/me'));
            setLoading(false);
            return;
          } catch {
            // fall through
          }
        }
        localStorage.removeItem('requestops.accessToken');
        localStorage.removeItem('requestops.refreshToken');
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [refreshSession]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      refreshSession().catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [user, refreshSession]);

  async function login(email, password, roleCode) {
    const response = await api.post('/auth/login', { email, password, roleCode });
    if (response.requiresRoleSelection) {
      return response;
    }
    storeTokens(response);
    setUser(response.user);
    return response.user;
  }

  async function completeLogin(email, password, roleCode) {
    const response = await api.post('/auth/login', { email, password, roleCode });
    storeTokens(response);
    setUser(response.user);
    return response.user;
  }

  async function switchRole(roleCode) {
    const response = await api.post('/auth/switch-role', { roleCode });
    storeTokens(response);
    setUser(response.user);
    return response.user;
  }

  async function requestRoleAccess(roleCode, reason) {
    const response = await api.post('/auth/role-access-requests', { roleCode, reason });
    setUser(await api.get('/auth/me'));
    return response;
  }

  async function register(payload) {
    return api.post('/auth/register', payload);
  }

  function logout() {
    localStorage.removeItem('requestops.accessToken');
    localStorage.removeItem('requestops.refreshToken');
    setUser(null);
  }

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    completeLogin,
    switchRole,
    requestRoleAccess,
    register,
    logout,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
