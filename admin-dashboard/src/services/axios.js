import axios from 'axios'

const RENDER_API_BASE_URL = 'https://pax-new.onrender.com/api'

const getDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:4000/api'
    }
  }

  return RENDER_API_BASE_URL
}

const normalizeApiBaseUrl = (configuredUrl) => {
  const fallback = getDefaultApiBaseUrl()
  const value = String(configuredUrl || '').trim().replace(/\/+$/, '')

  if (!value || /(^|\.)up\.railway\.app(?=\/|$)/i.test(value.replace(/^https?:\/\//i, ''))) {
    return fallback
  }

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      hostname === 'express-magic.onrender.com' ||
      hostname === 'express-magic-admin.onrender.com' ||
      hostname === 'pax-log.onrender.com' ||
      hostname === 'pax-log-admin.onrender.com'
    ) {
      return fallback
    }

    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/api'
    }

    return url.toString().replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

const apiBaseURL = normalizeApiBaseUrl(process.env.REACT_APP_API_BASE_URL)

const api = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true, // only if using cookies
})

let refreshPromise = null

// Request interceptor: attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: auto-refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Prevent infinite loops
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      localStorage.getItem('refreshToken')
    ) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshPromise) {
          refreshPromise = axios
            .post(
              `${apiBaseURL}/auth/refresh-token`,
              { refreshToken },
              {
                headers: {
                  'x-refresh-token': refreshToken, // ✅ Send in header for better security
                },
              },
            )
            .finally(() => {
              refreshPromise = null
            })
        }
        const res = await refreshPromise

        const newAccessToken = res.data.accessToken
        const newRefreshToken = res.data.refreshToken

        // Save tokens
        localStorage.setItem('accessToken', newAccessToken)
        localStorage.setItem('refreshToken', newRefreshToken)

        // Update Zustand store - import it dynamically to avoid circular dependencies
        import('../store/useAuthStore').then(({ useAuthStore }) => {
          const userId = localStorage.getItem('userId')
          useAuthStore.getState().login(newAccessToken, userId, newRefreshToken)
        })

        // Retry original request with new access token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshErr) {
        console.error('❌ Refresh token failed:', refreshErr)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('userId')

        // Update Zustand store
        import('../store/useAuthStore').then(({ useAuthStore }) => {
          useAuthStore.getState().logout()
        })

        window.location.href = '/#/auth/signin' // Force logout without relying on a host rewrite
      }
    }

    // Reject if not handled
    return Promise.reject(error)
  },
)

export { apiBaseURL, getDefaultApiBaseUrl, normalizeApiBaseUrl }
export default api
