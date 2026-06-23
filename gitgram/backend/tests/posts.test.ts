import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

describe('Posts API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    app = createApp();

    // Create a test user and get auth token
    const user = await prisma.user.create({
      data: {
        username: 'posttestuser',
        email: 'posttest@example.com',
        password: 'hashedpassword',
      },
    });
    userId = user.id;

    // Create an account for the user (required for Post creation)
    const account = await prisma.account.create({
      data: {
        type: 'USER',
        username: 'posttestuser',
        userId: user.id,
      },
    });
    accountId = account.id;

    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.post.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/posts', () => {
    it('should create a new post', async () => {
      const response = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Test post content',
          hashtags: ['test', 'post'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('post');
      expect(response.body.post.content).toBe('Test post content');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/posts')
        .send({
          content: 'Test post',
        });

      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/posts', () => {
    it('should get posts feed', async () => {
      const response = await request(app)
        .get('/api/v1/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('posts');
      expect(Array.isArray(response.body.posts)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('POST /api/v1/posts/:id/like', () => {
    let postId: string;

    beforeAll(async () => {
      const post = await prisma.post.create({
        data: {
          accountId,
          userId,
          content: 'Post to like',
        },
      });
      postId = post.id;
    });

    it('should like a post', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('liked');
    });

    it('should unlike a post when already liked', async () => {
      // Like first
      await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      const response = await request(app)
        .delete(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.liked).toBe(false);
    });
  });

  describe('POST /api/v1/posts/:id/comments', () => {
    let postId: string;

    beforeAll(async () => {
      const post = await prisma.post.create({
        data: {
          accountId,
          userId,
          content: 'Post to comment on',
        },
      });
      postId = post.id;
    });

    it('should create a comment', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Test comment',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('comment');
      expect(response.body.comment.content).toBe('Test comment');
    });

    it('should require comment content', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/posts/:id', () => {
    it('should delete own post', async () => {
      const post = await prisma.post.create({
        data: {
          accountId,
          userId,
          content: 'Post to delete',
        },
      });

      const response = await request(app)
        .delete(`/api/v1/posts/${post.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other user\'s post', async () => {
      const otherUser = await prisma.user.create({
        data: {
          username: 'otheruser',
          email: 'other@example.com',
          password: 'hashed',
        },
      });

      const otherAccount = await prisma.account.create({
        data: {
          type: 'USER',
          username: 'otheruser',
          userId: otherUser.id,
        },
      });

      const post = await prisma.post.create({
        data: {
          accountId: otherAccount.id,
          userId: otherUser.id,
          content: 'Other user post',
        },
      });

      const response = await request(app)
        .delete(`/api/v1/posts/${post.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);

      // Cleanup
      await prisma.post.delete({ where: { id: post.id } });
      await prisma.account.delete({ where: { id: otherAccount.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });
});
