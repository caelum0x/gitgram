import request from 'supertest';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';
import { testFixtures } from './fixtures';
import { generateTestAccessToken, authHeader, TEST_USER_ID } from './helpers';

// Mock advancedSearchService
jest.mock('../src/services/advancedSearchService', () => ({
  advancedSearch: jest.fn().mockResolvedValue({
    users: [],
    posts: [],
    hashtags: [],
  }),
}));

// Mock websocket
jest.mock('../src/websocket/socket', () => ({
  initializeSocket: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  emitToUser: jest.fn(),
}));

import { advancedSearch } from '../src/services/advancedSearchService';

const mockedAdvancedSearch = advancedSearch as jest.MockedFunction<typeof advancedSearch>;
const getResponseMessage = (body: any) =>
  body.error?.message ?? body.details?.[0]?.msg ?? body.error ?? body.message;

// Helper to create mock Prisma model (mirrors setup.ts)
const createMockPrismaModel = () => ({
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() })
  ),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  update: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'mock-id', ...data, updatedAt: new Date() })
  ),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockImplementation(({ create }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() })
  ),
  delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  count: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 } }),
  groupBy: jest.fn().mockResolvedValue([]),
});

// Ensure models used by searchController exist on mockPrisma
if (!mockPrisma.repositoryActivity) mockPrisma.repositoryActivity = createMockPrismaModel();
if (!mockPrisma.userLanguagePreference) mockPrisma.userLanguagePreference = createMockPrismaModel();
if (!mockPrisma.userTopicInterest) mockPrisma.userTopicInterest = createMockPrismaModel();

describe('Search API', () => {
  const app = createApp();
  let token: string;

  beforeEach(() => {
    token = generateTestAccessToken(TEST_USER_ID);
  });

  // =========================================================================
  // GET /api/v1/search  (basic search)
  // =========================================================================
  describe('GET /api/v1/search', () => {
    it('should search across users, posts, hashtags, and repositories', async () => {
      const mockUsers = [
        { id: 'user-1', username: 'testdev', avatar: null, bio: 'A developer', verified: false },
      ];
      const mockPosts = [
        {
          id: 'post-1',
          content: 'Testing code',
          isArchived: false,
          user: { id: 'user-1', username: 'testdev', avatar: null, verified: false },
        },
      ];
      const mockHashtags = [
        { id: 'tag-1', name: 'testing', count: 42 },
      ];
      const mockRepos = [
        {
          id: 'repo-1',
          fullName: 'user/test-repo',
          description: 'A test repo',
          stars: 100,
          language: 'TypeScript',
          topics: ['testing'],
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.post.findMany.mockResolvedValue(mockPosts);
      mockPrisma.hashtag.findMany.mockResolvedValue(mockHashtags);
      mockPrisma.repository.findMany.mockResolvedValue(mockRepos);

      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: 'test' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('posts');
      expect(res.body).toHaveProperty('hashtags');
      expect(res.body).toHaveProperty('repositories');
      expect(res.body.users).toHaveLength(1);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.hashtags).toHaveLength(1);
      expect(res.body.repositories).toHaveLength(1);
    });

    it('should work without authentication (optionalAuth)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.post.findMany.mockResolvedValue([]);
      mockPrisma.hashtag.findMany.mockResolvedValue([]);
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: 'test' });

      expect(res.status).toBe(200);
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: '' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
      expect(getResponseMessage(res.body)).toMatch(/Search query/);
    });

    it('should return 400 for query shorter than 2 characters', async () => {
      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: 'a' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
    });

    it('should return 400 when query parameter is missing', async () => {
      const res = await request(app)
        .get('/api/v1/search')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
    });

    it('should respect the limit parameter', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.post.findMany.mockResolvedValue([]);
      mockPrisma.hashtag.findMany.mockResolvedValue([]);
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: 'test', limit: 5 })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      // Verify findMany was called with the limit
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });

  // =========================================================================
  // GET /api/v1/search/advanced
  // =========================================================================
  describe('GET /api/v1/search/advanced', () => {
    it('should perform advanced search with filters', async () => {
      mockedAdvancedSearch.mockResolvedValue({
        users: [{ id: 'user-1', username: 'devuser' }],
        posts: [],
        hashtags: [],
      } as any);

      const res = await request(app)
        .get('/api/v1/search/advanced')
        .query({
          q: 'developer',
          type: 'users',
          verified: 'true',
        })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockedAdvancedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'developer',
          type: 'users',
          verified: true,
        }),
        expect.any(Number)
      );
    });

    it('should support date range filters', async () => {
      mockedAdvancedSearch.mockResolvedValue({ users: [], posts: [], hashtags: [] } as any);

      const res = await request(app)
        .get('/api/v1/search/advanced')
        .query({
          q: 'project',
          dateFrom: '2025-01-01',
          dateTo: '2025-12-31',
        })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockedAdvancedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'project',
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
        expect.any(Number)
      );
    });

    it('should support hasMedia and minLikes filters', async () => {
      mockedAdvancedSearch.mockResolvedValue({ users: [], posts: [], hashtags: [] } as any);

      const res = await request(app)
        .get('/api/v1/search/advanced')
        .query({
          q: 'code',
          hasMedia: 'true',
          minLikes: '10',
        })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockedAdvancedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          hasMedia: true,
          minLikes: 10,
        }),
        expect.any(Number)
      );
    });

    it('should return 400 for query shorter than 2 characters', async () => {
      const res = await request(app)
        .get('/api/v1/search/advanced')
        .query({ q: 'a' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
    });

    it('should work without authentication', async () => {
      mockedAdvancedSearch.mockResolvedValue({ users: [], posts: [], hashtags: [] } as any);

      const res = await request(app)
        .get('/api/v1/search/advanced')
        .query({ q: 'test' });

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /api/v1/search/repositories
  // =========================================================================
  describe('GET /api/v1/search/repositories', () => {
    it('should search repositories', async () => {
      const mockRepos = [
        {
          id: 'repo-1',
          fullName: 'user/react-app',
          owner: 'user',
          name: 'react-app',
          description: 'A React application',
          stars: 150,
          forks: 20,
          language: 'TypeScript',
          topics: ['react', 'typescript'],
          followersCount: 10,
          htmlUrl: 'https://github.com/user/react-app',
          updatedAt: new Date(),
        },
      ];

      mockPrisma.repository.findMany.mockResolvedValue(mockRepos);

      const res = await request(app)
        .get('/api/v1/search/repositories')
        .query({ q: 'react' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('repositories');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.repositories).toHaveLength(1);
    });

    it('should support language filter', async () => {
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/repositories')
        .query({ q: 'app', language: 'Python' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockPrisma.repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            language: { equals: 'Python', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should support minStars filter', async () => {
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/repositories')
        .query({ q: 'app', minStars: '100' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockPrisma.repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stars: { gte: 100 },
          }),
        })
      );
    });

    it('should support sorting', async () => {
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/repositories')
        .query({ q: 'test', sort: 'forks' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockPrisma.repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { forks: 'desc' },
        })
      );
    });

    it('should work without authentication', async () => {
      mockPrisma.repository.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/repositories')
        .query({ q: 'test' });

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /api/v1/search/trending
  // =========================================================================
  describe('GET /api/v1/search/trending', () => {
    it('should return trending content across all types', async () => {
      mockPrisma.post.findMany.mockResolvedValue([]);
      mockPrisma.repository.findMany.mockResolvedValue([]);
      mockPrisma.hashtag.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/trending')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
    });

    it('should filter by type when specified', async () => {
      mockPrisma.hashtag.findMany.mockResolvedValue([
        { id: 'tag-1', name: 'javascript', count: 500 },
        { id: 'tag-2', name: 'typescript', count: 400 },
      ]);

      const res = await request(app)
        .get('/api/v1/search/trending')
        .query({ type: 'hashtags' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hashtags');
    });

    it('should work without authentication', async () => {
      mockPrisma.post.findMany.mockResolvedValue([]);
      mockPrisma.repository.findMany.mockResolvedValue([]);
      mockPrisma.hashtag.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/trending');

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /api/v1/search/snippets
  // =========================================================================
  describe('GET /api/v1/search/snippets', () => {
    it('should search code snippets', async () => {
      const mockSnippets = [
        {
          id: 'snippet-1',
          title: 'React Hook',
          description: 'Custom useState hook',
          code: 'const [state, setState] = useState()',
          language: 'TypeScript',
          likesCount: 10,
          createdAt: new Date(),
          user: { id: 'user-1', username: 'devuser', avatar: null },
          repository: { fullName: 'user/repo' },
        },
      ];

      mockPrisma.codeSnippet.findMany.mockResolvedValue(mockSnippets);

      const res = await request(app)
        .get('/api/v1/search/snippets')
        .query({ q: 'hook' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('snippets');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.snippets).toHaveLength(1);
    });

    it('should support language filter for snippets', async () => {
      mockPrisma.codeSnippet.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/snippets')
        .query({ q: 'sort', language: 'Python' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockPrisma.codeSnippet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            language: { equals: 'Python', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should work without authentication', async () => {
      mockPrisma.codeSnippet.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/snippets')
        .query({ q: 'test' });

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /api/v1/search/recommended
  // =========================================================================
  describe('GET /api/v1/search/recommended', () => {
    it('should return recommended posts for authenticated user', async () => {
      mockPrisma.userLanguagePreference.findMany.mockResolvedValue([]);
      mockPrisma.userTopicInterest.findMany.mockResolvedValue([]);
      mockPrisma.follow.findMany.mockResolvedValue([]);
      mockPrisma.post.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/recommended')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('posts');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/search/recommended');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/search/activities
  // =========================================================================
  describe('GET /api/v1/search/activities', () => {
    it('should search GitHub activities', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          eventType: 'PushEvent',
          title: 'Push to main',
          body: 'Pushed 3 commits',
          actorLogin: 'devuser',
          occurredAt: new Date(),
          repository: { fullName: 'user/repo', htmlUrl: 'https://github.com/user/repo' },
        },
      ];

      mockPrisma.repositoryActivity.findMany.mockResolvedValue(mockActivities);

      const res = await request(app)
        .get('/api/v1/search/activities')
        .query({ q: 'push' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('activities');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.activities).toHaveLength(1);
    });

    it('should support eventType filter', async () => {
      mockPrisma.repositoryActivity.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/activities')
        .query({ eventType: 'PushEvent' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(mockPrisma.repositoryActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'PushEvent',
          }),
        })
      );
    });

    it('should work without authentication', async () => {
      mockPrisma.repositoryActivity.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/search/activities')
        .query({ q: 'test' });

      expect(res.status).toBe(200);
    });
  });
});
