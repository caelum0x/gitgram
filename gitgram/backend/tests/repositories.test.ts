import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

describe('Repositories API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let accountId: string;
  let repositoryId: string;

  beforeAll(async () => {
    app = createApp();

    // Create a test user
    const user = await prisma.user.create({
      data: {
        username: 'repotestuser',
        email: 'repotest@example.com',
        password: 'hashedpassword',
        githubUsername: 'repotestuser',
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;

    // Create account for user
    const account = await prisma.account.create({
      data: {
        type: 'USER',
        username: 'repotestuser',
        userId: user.id,
      },
    });
    accountId = account.id;

    // Create a test repository
    const repo = await prisma.repository.create({
      data: {
        owner: 'repotestuser',
        name: 'test-repo',
        fullName: 'repotestuser/test-repo',
        htmlUrl: 'https://github.com/repotestuser/test-repo',
        description: 'A test repository',
        stars: 42,
        forks: 7,
        language: 'TypeScript',
        topics: ['testing', 'typescript'],
        lastFetched: new Date(),
      },
    });
    repositoryId = repo.id;

    // Create some test posts linked to the repo
    await prisma.post.createMany({
      data: [
        {
          accountId,
          userId,
          repositoryId,
          content: 'First post about this repo',
          type: 'REPOSITORY',
          mediaUrls: [],
        },
        {
          accountId,
          userId,
          repositoryId,
          content: 'Second post with media',
          type: 'IMAGE',
          mediaUrls: ['https://example.com/image.png'],
        },
        {
          accountId,
          userId,
          repositoryId,
          content: 'Third post about the repo',
          type: 'REPOSITORY',
          mediaUrls: [],
        },
      ],
    });

    // Create a test code snippet linked to the repo
    await prisma.codeSnippet.create({
      data: {
        userId,
        repositoryId,
        title: 'Test Snippet',
        description: 'A useful code snippet',
        code: 'console.log("hello world");',
        language: 'javascript',
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await prisma.codeSnippet.deleteMany({ where: { repositoryId } });
    await prisma.repositoryFollow.deleteMany({ where: { repositoryId } });
    await prisma.post.deleteMany({ where: { repositoryId } });
    await prisma.repository.delete({ where: { id: repositoryId } });
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  // ============================================
  // GET /api/v1/repositories/:owner/:name
  // ============================================
  describe('GET /api/v1/repositories/:owner/:name', () => {
    it('should return repository details', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('repository');
      expect(response.body.repository.fullName).toBe('repotestuser/test-repo');
      expect(response.body.repository.description).toBe('A test repository');
      expect(response.body.repository.stars).toBe(42);
      expect(response.body).toHaveProperty('isFollowing');
    });

    it('should return 404 for non-existent repository', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/nobody/nonexistent-repo');

      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // GET /api/v1/repositories/:owner/:name/posts
  // ============================================
  describe('GET /api/v1/repositories/:owner/:name/posts', () => {
    it('should return paginated posts', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/posts')
        .query({ page: 1, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('posts');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.posts)).toBe(true);
      expect(response.body.posts.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.pagination).toHaveProperty('hasMore');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should return all posts with default pagination', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/posts');

      expect(response.status).toBe(200);
      expect(response.body.posts.length).toBe(3);
      expect(response.body.total).toBe(3);
    });

    it('should support page parameter', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/posts')
        .query({ page: 2, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.posts.length).toBe(1); // 3 total, page 2 with limit 2 = 1 remaining
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should include user details in posts', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/posts');

      expect(response.status).toBe(200);
      const post = response.body.posts[0];
      expect(post).toHaveProperty('user');
      expect(post.user).toHaveProperty('username');
    });
  });

  // ============================================
  // GET /api/v1/repositories/:owner/:name/snippets
  // ============================================
  describe('GET /api/v1/repositories/:owner/:name/snippets', () => {
    it('should return repository snippets', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/snippets');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('snippets');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.snippets)).toBe(true);
      expect(response.body.snippets.length).toBeGreaterThanOrEqual(1);
    });

    it('should return snippet details', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/snippets');

      expect(response.status).toBe(200);
      const snippet = response.body.snippets[0];
      expect(snippet).toHaveProperty('title', 'Test Snippet');
      expect(snippet).toHaveProperty('code');
      expect(snippet).toHaveProperty('language', 'javascript');
      expect(snippet).toHaveProperty('user');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/snippets')
        .query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.snippets.length).toBeLessThanOrEqual(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
    });
  });

  // ============================================
  // GET /api/v1/repositories/:owner/:name/media
  // ============================================
  describe('GET /api/v1/repositories/:owner/:name/media', () => {
    it('should return media posts', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/media');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('posts');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.posts)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/media')
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });
  });

  // ============================================
  // Follow / Unfollow
  // ============================================
  describe('POST /api/v1/repositories/:owner/:name/follow', () => {
    afterEach(async () => {
      // Clean up follows
      await prisma.repositoryFollow.deleteMany({
        where: { userId, repositoryId },
      });
    });

    it('should follow a repository', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Repository followed');

      // Verify follow exists
      const follow = await prisma.repositoryFollow.findUnique({
        where: { userId_repositoryId: { userId, repositoryId } },
      });
      expect(follow).not.toBeNull();
    });

    it('should return 400 when already following', async () => {
      // Follow first
      await prisma.repositoryFollow.create({
        data: { userId, repositoryId },
      });

      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/follow');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/repositories/:owner/:name/follow', () => {
    it('should unfollow a repository', async () => {
      // Follow first
      await prisma.repositoryFollow.create({
        data: { userId, repositoryId },
      });

      const response = await request(app)
        .delete('/api/v1/repositories/repotestuser/test-repo/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Repository unfollowed');

      // Verify follow is removed
      const follow = await prisma.repositoryFollow.findUnique({
        where: { userId_repositoryId: { userId, repositoryId } },
      });
      expect(follow).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/repositories/repotestuser/test-repo/follow');

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // GET /api/v1/repositories/:owner/:name/followers
  // ============================================
  describe('GET /api/v1/repositories/:owner/:name/followers', () => {
    it('should return followers list', async () => {
      // Create a follow
      await prisma.repositoryFollow.create({
        data: { userId, repositoryId },
      });

      const response = await request(app)
        .get('/api/v1/repositories/repotestuser/test-repo/followers');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('followers');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.total).toBeGreaterThanOrEqual(1);

      // Clean up
      await prisma.repositoryFollow.deleteMany({
        where: { userId, repositoryId },
      });
    });
  });

  // ============================================
  // POST /api/v1/repositories/:owner/:name/change-story
  // ============================================
  describe('POST /api/v1/repositories/:owner/:name/change-story', () => {
    it('should create a change story post', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/change-story')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          checkpointId: 'chk_abc12345',
          title: 'Test Change Story',
          summary: 'Testing checkpoint creation',
          diffSummary: { added: 10, removed: 3, modified: 5 },
          changedFiles: ['src/index.ts', 'package.json'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('post');
      expect(response.body.post.content).toContain('[AITM_CHANGE_STORY]');
      expect(response.body.post.content).toContain('checkpointId=chk_abc12345');
    });

    it('should require checkpointId', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/change-story')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Missing checkpoint',
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/repositories/repotestuser/test-repo/change-story')
        .send({
          checkpointId: 'chk_test123',
        });

      expect(response.status).toBe(401);
    });
  });
});
