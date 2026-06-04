import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('requestops.accessToken')));

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('requestops.accessToken');
      if (!token) return;
      try {
        setUser(await api.get('/auth/me'));
      } catch {
        localStorage.removeItem('requestops.accessToken');
        localStorage.removeItem('requestops.refreshToken');
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  async function login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('requestops.accessToken', response.accessToken);
    localStorage.setItem('requestops.refreshToken', response.refreshToken);
    setUser(response.user);
    return response.user;
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
