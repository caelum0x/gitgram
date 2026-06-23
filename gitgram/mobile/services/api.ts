import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../constants/Config';
import { useAuthStore } from '../store/authStore';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Helper to check if error is retryable
const isRetryableError = (error: AxiosError) => {
  // Retry on network errors or 5xx server errors
  if (!error.response) return true; // Network error
  const status = error.response.status;
  return status >= 500 && status < 600;
};

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const { accessToken, refreshAccessToken } = useAuthStore.getState();

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    } else {
      // Try to refresh token
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors, token refresh, and retries
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Initialize retry count
    originalRequest._retryCount = originalRequest._retryCount || 0;

    // Handle 401 unauthorized - token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token
      const newToken = await useAuthStore.getState().refreshAccessToken();

      if (newToken) {
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } else {
        // Refresh failed, logout
        await useAuthStore.getState().logout();
      }
    }

    // Handle retryable errors (network issues, 5xx)
    if (isRetryableError(error) && originalRequest._retryCount < MAX_RETRIES) {
      originalRequest._retryCount += 1;

      // Exponential backoff
      const delay = RETRY_DELAY * Math.pow(2, originalRequest._retryCount - 1);
      await sleep(delay);

      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;

