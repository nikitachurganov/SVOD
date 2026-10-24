import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A wrong password on the sign-in form is not an expired session: let the form show the error
    const isCredentialsRequest = /^\/auth\/(login|register)$/.test(error.config?.url ?? '');
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isCredentialsRequest) {
      localStorage.removeItem('access_token');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  },
);

export default api;
