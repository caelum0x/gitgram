import axios, { AxiosError } from 'axios'

const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second
const API_VERSION_PREFIX = '/v1'

function normalizeApiPath(url?: string) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url

  const normalized = url.startsWith('/') ? url : `/${url}`
  if (normalized === API_VERSION_PREFIX || normalized.startsWith(`${API_VERSION_PREFIX}/`)) {
    return normalized
  }

  return `${API_VERSION_PREFIX}${normalized}`
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly cookies automatically
  timeout: 30000, // 30 second timeout
})

// Helper to check if error is retryable
const isRetryableError = (error: AxiosError) => {
  // Retry on network errors or 5xx server errors
  if (!error.response) return true // Network error
  const status = error.response.status
  return status >= 500 && status < 600
}

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper to refresh token (cookies are sent automatically)
const refreshAccessToken = async (): Promise<boolean> => {
  try {
    await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}${normalizeApiPath('/auth/refresh')}`,
      {},
      { withCredentials: true }
    )
    return true
  } catch {
    return false
  }
}

// No request interceptor needed — cookies are sent automatically via withCredentials
api.interceptors.request.use((config) => {
  config.url = normalizeApiPath(config.url)
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any

    if (!originalRequest) {
      return Promise.reject(error)
    }

    // Initialize retry count
    originalRequest._retryCount = originalRequest._retryCount || 0

    // Handle 401 unauthorized - try token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshed = await refreshAccessToken()
      if (refreshed) {
        return api(originalRequest)
      }

      // Refresh failed, redirect to login
      if (typeof window !== 'undefined') window.location.href = '/login'
    }

    // Handle retryable errors (network issues, 5xx)
    if (isRetryableError(error) && originalRequest._retryCount < MAX_RETRIES) {
      originalRequest._retryCount += 1

      // Exponential backoff
      const delay = RETRY_DELAY * Math.pow(2, originalRequest._retryCount - 1)
      await sleep(delay)

      return api(originalRequest)
    }

    return Promise.reject(error)
  }
)

export default api
