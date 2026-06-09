import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('requestops.accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('requestops.refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
          const tokens = response.data?.data ?? response.data;
          if (tokens?.accessToken) {
            localStorage.setItem('requestops.accessToken', tokens.accessToken);
            if (tokens.refreshToken) {
              localStorage.setItem('requestops.refreshToken', tokens.refreshToken);
            }
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
            return api(originalRequest);
          }
        } catch {
          localStorage.removeItem('requestops.accessToken');
          localStorage.removeItem('requestops.refreshToken');
        }
      }
      localStorage.removeItem('requestops.accessToken');
      localStorage.removeItem('requestops.refreshToken');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    const apiError = error.response?.data?.error;
    const message = apiError?.message || error.message || 'Request failed';
    const requestError = new Error(message);
    requestError.details = apiError?.details;
    requestError.status = error.response?.status;
    return Promise.reject(requestError);
  },
);

export default api;
