/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import api from '@/services/api'
import { userService } from '@/services/userService'

const mock = new MockAdapter(api)

describe('userService', () => {
  beforeEach(() => {
    mock.reset()
  })

  describe('getProfile', () => {
    it('should fetch user profile by username', async () => {
      mock.onGet('/v1/users/testuser').reply(200, {
        id: '1',
        username: 'testuser',
        bio: 'Hello',
        followersCount: 10,
      })

      const result = await userService.getProfile('testuser')
      expect(result.username).toBe('testuser')
      expect(result.followersCount).toBe(10)
    })

    it('should throw on non-existent user', async () => {
      mock.onGet('/v1/users/nobody').reply(404)
      await expect(userService.getProfile('nobody')).rejects.toThrow()
    })
  })

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      mock.onPut('/v1/users/profile').reply(200, {
        username: 'testuser',
        bio: 'Updated bio',
      })

      const result = await userService.updateProfile({ bio: 'Updated bio' })
      expect(result.bio).toBe('Updated bio')
    })
  })

  describe('follow / unfollow', () => {
    it('should follow a user', async () => {
      mock.onPost('/v1/users/u2/follow').reply(200, { following: true })
      const result = await userService.follow('u2')
      expect(result.following).toBe(true)
    })

    it('should unfollow a user', async () => {
      mock.onDelete('/v1/users/u2/follow').reply(200)
      await expect(userService.unfollow('u2')).resolves.not.toThrow()
    })
  })

  describe('getFollowers / getFollowing', () => {
    it('should fetch followers', async () => {
      mock.onGet('/v1/users/u1/followers').reply(200, {
        users: [{ id: 'u2', username: 'follower1' }],
        total: 1,
      })

      const result = await userService.getFollowers('u1')
      expect(result.users).toHaveLength(1)
    })

    it('should fetch following with pagination', async () => {
      mock.onGet('/v1/users/u1/following').reply((config) => {
        expect(config.params).toEqual({ page: 2, limit: 10 })
        return [200, { users: [], total: 0 }]
      })

      await userService.getFollowing('u1', 2, 10)
    })
  })

  describe('searchUsers', () => {
    it('should search users by query', async () => {
      mock.onGet('/v1/search/users').reply(200, {
        users: [{ id: 'u1', username: 'devuser' }],
      })

      const result = await userService.searchUsers('dev')
      expect(result.users).toHaveLength(1)
    })
  })

  describe('block / unblock', () => {
    it('should block a user', async () => {
      mock.onPost('/v1/user-actions/block/u2').reply(200, { blocked: true })
      const result = await userService.blockUser('u2')
      expect(result.blocked).toBe(true)
    })

    it('should unblock a user', async () => {
      mock.onDelete('/v1/user-actions/block/u2').reply(200)
      await expect(userService.unblockUser('u2')).resolves.not.toThrow()
    })
  })

  describe('account management', () => {
    it('should change password', async () => {
      mock.onPost('/v1/auth/change-password').reply(200, { message: 'Password updated' })
      const result = await userService.changePassword('old', 'new')
      expect(result.message).toBe('Password updated')
    })

    it('should schedule account deletion', async () => {
      mock.onPost('/v1/users/delete').reply(200, {
        message: 'Account scheduled for deletion',
        deletionDate: '2026-04-09',
      })
      const result = await userService.scheduleAccountDeletion('password', 'leaving')
      expect(result.deletionDate).toBeTruthy()
    })

    it('should cancel account deletion', async () => {
      mock.onDelete('/v1/users/delete').reply(200, { message: 'Deletion cancelled' })
      const result = await userService.cancelAccountDeletion()
      expect(result.message).toBe('Deletion cancelled')
    })
  })
})
