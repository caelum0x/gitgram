import { describe, it, expect, vi, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import api from '@/services/api'
import { authService } from '@/services/authService'

const mock = new MockAdapter(api)

const mockUser = {
  id: '1',
  username: 'testuser',
  email: 'test@example.com',
}

describe('authService', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
  })

  describe('login', () => {
    it('should login and store user in localStorage', async () => {
      mock.onPost('/v1/auth/login').reply(200, {
        user: mockUser,
        token: 'access-token',
      })

      const result = await authService.login('test@example.com', 'password')

      expect(result.user).toEqual(mockUser)
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser))
    })

    it('should return 2FA challenge when required', async () => {
      mock.onPost('/v1/auth/login').reply(200, {
        requires2FA: true,
        tempToken: 'temp-2fa',
      })

      const result = await authService.login('test@example.com', 'password')

      expect(result.requires2FA).toBe(true)
      expect(result.tempToken).toBe('temp-2fa')
    })

    it('should throw on invalid credentials', async () => {
      mock.onPost('/v1/auth/login').reply(401, { message: 'Invalid credentials' })

      await expect(authService.login('bad@email.com', 'wrong')).rejects.toThrow()
    })
  })

  describe('register', () => {
    it('should register and store user in localStorage', async () => {
      mock.onPost('/v1/auth/register').reply(201, {
        user: mockUser,
        token: 'access-token',
      })

      const result = await authService.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      })

      expect(result.user).toEqual(mockUser)
      expect(localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser))
    })
  })

  describe('logout', () => {
    it('should call logout endpoint and clear user from localStorage', async () => {
      mock.onPost('/v1/auth/logout').reply(200, { message: 'Logged out' })

      await authService.logout()

      expect(localStorage.removeItem).toHaveBeenCalledWith('user')
    })
  })

  describe('getMe', () => {
    it('should return current user', async () => {
      mock.onGet('/v1/auth/me').reply(200, { user: mockUser, account: null })

      const result = await authService.getMe()

      expect(result.user).toEqual(mockUser)
    })
  })

  describe('forgotPassword', () => {
    it('should send forgot password request', async () => {
      mock.onPost('/v1/auth/forgot-password').reply(200, {
        message: 'If an account exists with this email, a password reset link has been sent',
      })

      const result = await authService.forgotPassword('test@example.com')

      expect(result.message).toContain('password reset link')
    })
  })
})
