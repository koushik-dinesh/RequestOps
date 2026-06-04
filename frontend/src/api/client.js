import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1',
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
  (error) => {
    const apiError = error.response?.data?.error;
    const message = apiError?.message || error.message || 'Request failed';
    const requestError = new Error(message);
    requestError.details = apiError?.details;
    requestError.status = error.response?.status;
    return Promise.reject(requestError);
  },
);

export default api;
