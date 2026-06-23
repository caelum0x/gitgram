import { create } from 'zustand'
import { authService } from '@/services/authService'

interface User {
  id: string
  username: string
  email: string
  avatar?: string
  bio?: string
  fullName?: string
  githubUsername?: string
  githubId?: string
  isPrivate?: boolean
  interests?: string[]
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isInitialized: boolean
  // 2FA challenge state
  pending2FA: boolean
  tempToken: string | null
  pendingEmail: string | null
  pendingPassword: string | null
  login: (email: string, password: string) => Promise<void>
  verify2FA: (code: string) => Promise<void>
  cancel2FA: () => void
  register: (userData: any) => Promise<void>
  logout: () => Promise<void>
  initialize: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  pending2FA: false,
  tempToken: null,
  pendingEmail: null,
  pendingPassword: null,

  login: async (email, password) => {
    const data = await authService.login(email, password)

    // If 2FA is required, store challenge state
    if (data.requires2FA) {
      set({
        pending2FA: true,
        tempToken: data.tempToken,
        pendingEmail: email,
        pendingPassword: password,
      })
      return
    }

    set({ user: data.user, isAuthenticated: true })
  },

  verify2FA: async (code) => {
    const { tempToken, pendingEmail, pendingPassword } = get()
    if (!tempToken || !pendingEmail || !pendingPassword) {
      throw new Error('No pending 2FA challenge')
    }

    // Re-send login with the 2FA code
    const data = await authService.login(pendingEmail, pendingPassword, code)

    set({
      user: data.user,
      isAuthenticated: true,
      pending2FA: false,
      tempToken: null,
      pendingEmail: null,
      pendingPassword: null,
    })
  },

  cancel2FA: () => {
    set({
      pending2FA: false,
      tempToken: null,
      pendingEmail: null,
      pendingPassword: null,
    })
  },

  register: async (userData) => {
    const data = await authService.register(userData)
    set({ user: data.user, isAuthenticated: true })
  },

  logout: async () => {
    await authService.logout()
    set({ user: null, isAuthenticated: false })
  },

  initialize: () => {
    // Try to load cached user data from localStorage for instant UI
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, isAuthenticated: true, isInitialized: true })
      } catch {
        localStorage.removeItem('user')
        set({ isInitialized: true })
      }
    } else {
      set({ isInitialized: true })
    }

    // Validate session against backend (cookie is sent automatically)
    authService.getMe().then(({ user }) => {
      if (user) {
        set({ user, isAuthenticated: true })
        localStorage.setItem('user', JSON.stringify(user))
      } else {
        set({ user: null, isAuthenticated: false })
        localStorage.removeItem('user')
      }
    }).catch(() => {
      set({ user: null, isAuthenticated: false })
      localStorage.removeItem('user')
    })
  },

  setUser: (user) => {
    set({ user })
    localStorage.setItem('user', JSON.stringify(user))
  },
}))
