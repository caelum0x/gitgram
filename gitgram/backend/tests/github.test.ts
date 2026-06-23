import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

describe('GitHub Integration API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();

    // Create a test user and get auth token
    const user = await prisma.user.create({
      data: {
        username: 'githubtestuser',
        email: 'githubtest@example.com',
        password: 'hashedpassword',
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/github/trending', () => {
    it('should get trending repositories', async () => {
      const response = await request(app)
        .get('/api/v1/github/trending')
        .query({ language: 'javascript', timeframe: 'week' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('repositories');
      expect(Array.isArray(response.body.repositories)).toBe(true);
    });

    it('should support language filter', async () => {
      const response = await request(app)
        .get('/api/v1/github/trending')
        .query({ language: 'typescript' });

      expect(response.status).toBe(200);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/github/trending')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('GET /api/v1/github/search', () => {
    it('should search repositories', async () => {
      const response = await request(app)
        .get('/api/v1/github/search')
        .query({ q: 'react' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('repositories');
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/v1/github/search');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/repositories/:owner/:name', () => {
    it('should get repository details', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/facebook/react');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('repository');
    });

    it('should return 404 for non-existent repo', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/nonexistent/fakerepo12345');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/repositories/:owner/:name/follow', () => {
    it('should follow a repository', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/facebook/react/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('following');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/facebook/react/follow');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/github/recommendations', () => {
    it('should get recommended repositories for user', async () => {
      const response = await request(app)
        .get('/api/v1/github/recommendations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('repositories');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/github/recommendations');

      expect(response.status).toBe(401);
    });
  });
});

describe('Account System API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();

    const user = await prisma.user.create({
      data: {
        username: 'accounttestuser',
        email: 'accounttest@example.com',
        password: 'hashedpassword',
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/accounts/:owner/:repo', () => {
    it('should get account profile for repository', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/facebook/react');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('account');
    });
  });

  describe('GET /api/v1/accounts/:owner/:repo/posts', () => {
    it('should get posts for repository account', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/facebook/react/posts')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('posts');
    });
  });

  describe('POST /api/v1/accounts/:owner/:repo/follow', () => {
    it('should follow an account', async () => {
      const response = await request(app)
        .post('/api/v1/accounts/facebook/react/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/accounts/facebook/react/follow');

      expect(response.status).toBe(401);
    });
  });
});
