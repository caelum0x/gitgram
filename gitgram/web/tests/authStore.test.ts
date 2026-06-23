import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/store/authStore'

// Mock authService
vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

import { authService } from '@/services/authService'

const mockUser = {
  id: '1',
  username: 'testuser',
  email: 'test@example.com',
}

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isInitialized: false,
      pending2FA: false,
      tempToken: null,
      pendingEmail: null,
      pendingPassword: null,
    })
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should start with unauthenticated state', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
  })

  it('should login successfully', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      user: mockUser,
      token: 'test-token',
    })

    await useAuthStore.getState().login('test@example.com', 'password')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user).toEqual(mockUser)
  })

  it('should handle 2FA challenge', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      requires2FA: true,
      tempToken: 'temp-2fa-token',
    })

    await useAuthStore.getState().login('test@example.com', 'password')

    const state = useAuthStore.getState()
    expect(state.pending2FA).toBe(true)
    expect(state.tempToken).toBe('temp-2fa-token')
    expect(state.isAuthenticated).toBe(false)
  })

  it('should register successfully', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: mockUser,
      token: 'test-token',
    })

    await useAuthStore.getState().register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    })

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user).toEqual(mockUser)
  })

  it('should logout successfully', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined)

    // Set authenticated state first
    useAuthStore.setState({ user: mockUser, isAuthenticated: true })

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
  })

  it('should cancel 2FA challenge', () => {
    useAuthStore.setState({
      pending2FA: true,
      tempToken: 'temp-token',
      pendingEmail: 'test@example.com',
      pendingPassword: 'password',
    })

    useAuthStore.getState().cancel2FA()

    const state = useAuthStore.getState()
    expect(state.pending2FA).toBe(false)
    expect(state.tempToken).toBeNull()
  })

  it('should initialize from localStorage user data', () => {
    localStorage.setItem('user', JSON.stringify(mockUser))
    vi.mocked(authService.getMe).mockResolvedValue({ user: mockUser })

    useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user).toEqual(mockUser)
    expect(state.isInitialized).toBe(true)
  })

  it('should initialize as unauthenticated when no cached user', () => {
    vi.mocked(authService.getMe).mockRejectedValue(new Error('Not authenticated'))

    useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isInitialized).toBe(true)
  })
})
