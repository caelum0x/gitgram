import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

describe('Users API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    app = createApp();
    
    // Create test users
    const user = await prisma.user.create({
      data: {
        username: 'usertest',
        email: 'usertest@example.com',
        password: 'hashedpassword',
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;

    const otherUser = await prisma.user.create({
      data: {
        username: 'otherusertest',
        email: 'otherusertest@example.com',
        password: 'hashedpassword',
      },
    });
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/users/:id', () => {
    it('should get user profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${otherUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(otherUserId);
    });

    it('should get own profile with /me', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(userId);
    });
  });

  describe('POST /api/v1/users/:id/follow', () => {
    it('should follow a user', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${otherUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('following');
      expect(response.body.following).toBe(true);
    });

    it('should not follow self', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${userId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });

    it('should unfollow when already following', async () => {
      await prisma.follow.deleteMany({
        where: { followerId: userId, followingId: otherUserId },
      });

      // Follow first
      await request(app)
        .post(`/api/v1/users/${otherUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      // Unfollow
      const response = await request(app)
        .post(`/api/v1/users/${otherUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.following).toBe(false);
    });
  });

  describe('GET /api/v1/users/:id/followers', () => {
    it('should get user followers', async () => {
      // Create a follow relationship
      await prisma.follow.create({
        data: {
          followerId: userId,
          followingId: otherUserId,
        },
      });

      const response = await request(app)
        .get(`/api/v1/users/${otherUserId}/followers`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('followers');
      expect(Array.isArray(response.body.followers)).toBe(true);
    });
  });

  describe('GET /api/v1/users/:id/following', () => {
    it('should get users that a user is following', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${userId}/following`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('following');
      expect(Array.isArray(response.body.following)).toBe(true);
    });
  });

  describe('GET /api/v1/users/search', () => {
    it('should search users', async () => {
      const response = await request(app)
        .get('/api/v1/users/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });
  });

  describe('POST /api/v1/users/:id/block', () => {
    it('should block a user', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${otherUserId}/block`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('blocked');
    });

    it('should unblock a user', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${otherUserId}/block`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });
});
