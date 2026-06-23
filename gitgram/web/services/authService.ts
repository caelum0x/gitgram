import api from './api'

export const authService = {
  login: async (email: string, password: string, twoFactorCode?: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password, twoFactorCode })

      // If 2FA is required, return the challenge (no token yet)
      if (data.requires2FA) {
        return { requires2FA: true, tempToken: data.tempToken }
      }

      // Token is set as httpOnly cookie by the backend
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user))
      }
      return data
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: unknown }; message?: string }
      console.error('Login service error:', axiosErr.response?.data || axiosErr.message)
      throw error
    }
  },

  verify2FA: async (tempToken: string, code: string) => {
    const { data } = await api.post('/auth/login', {
      tempToken,
      twoFactorCode: code,
    }, {
      headers: { Authorization: `Bearer ${tempToken}` }
    })
    // Token is set as httpOnly cookie by the backend
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user))
    }
    return data
  },

  register: async (userData: { username: string; email: string; password: string; fullName?: string }) => {
    const { data } = await api.post('/auth/register', userData)
    // Token is set as httpOnly cookie by the backend
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user))
    }
    return data
  },

  logout: async () => {
    await api.post('/auth/logout')
    localStorage.removeItem('user')
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me')
    return data
  },

  verifyEmail: async (token: string) => {
    const { data } = await api.post('/auth/verify-email', { token })
    return data
  },

  forgotPassword: async (email: string) => {
    const { data } = await api.post('/auth/forgot-password', { email })
    return data
  },

  resetPassword: async (token: string, password: string) => {
    const { data } = await api.post('/auth/reset-password', { token, password })
    return data
  },
}
