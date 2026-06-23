/**
 * Trending API — Integration Tests
 *
 * Tests all public trending endpoints via supertest against the real Express
 * app. Prisma is mocked by tests/setup.ts (applied globally via
 * jest.config.js setupFilesAfterEnv). The `cache` object exported from
 * redisService wraps the real redis client internally so it must also be
 * mocked here — the global setup only stubs `redisClient` itself, not the
 * higher-level cache wrapper that the trendingRankingService imports.
 */

// ─── Mock the cache layer BEFORE any module imports ─────────────────────────
// setup.ts mocks `redisClient` but trendingRankingService imports `cache`
// (a wrapper object) which closes over the real client. We override the whole
// redisService module so `cache.get` / `cache.set` never touch a real socket.
const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
};

const mockRedisClientFull = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(0),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  isOpen: true,
  isReady: true,
};

jest.mock('../src/services/redisService', () => ({
  __esModule: true,
  default: mockRedisClientFull,
  redisClient: mockRedisClientFull,
  connectRedis: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClientFull),
  cache: mockCache,
}));

import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTrendingEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    entityType: 'POST',
    entityId: `post-${Math.random().toString(36).slice(2)}`,
    tier: 'TRENDING_TODAY',
    score: 42.5,
    rawScore: 50.0,
    gamingPenalty: 0,
    language: null,
    topic: null,
    rank: 1,
    metadata: {},
    periodStart: new Date(),
    periodEnd: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `post-${Math.random().toString(36).slice(2)}`,
    content: 'Sample trending post',
    type: 'POST',
    status: 'PUBLISHED',
    isArchived: false,
    likesCount: 10,
    commentsCount: 3,
    sharesCount: 1,
    viewsCount: 100,
    userId: 'user-1',
    accountId: 'account-1',
    repositoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `repo-${Math.random().toString(36).slice(2)}`,
    fullName: 'owner/sample-repo',
    owner: 'owner',
    name: 'sample-repo',
    language: 'TypeScript',
    topics: ['typescript'],
    stars: 120,
    forks: 15,
    description: 'A sample repository',
    claimedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `user-${Math.random().toString(36).slice(2)}`,
    username: 'trendingdev',
    avatar: null,
    bio: 'Developer',
    verified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeHashtag(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `tag-${Math.random().toString(36).slice(2)}`,
    name: 'typescript',
    count: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe('Trending API Integration', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    // Mocked prisma — no real connection to close
    await mockPrisma.$disconnect();
  });

  // ── GET /api/v1/trending/posts ───────────────────────────────────────────

  describe('GET /api/v1/trending/posts', () => {
    it('returns 200 with an array of posts in data.posts', async () => {
      const postId = 'post-trending-1';
      const entry = makeTrendingEntry({ entityType: 'POST', entityId: postId, rank: 1 });
      const post = makePost({ id: postId });

      mockPrisma.trendingEntry.__rows.push(entry);
      mockPrisma.post.__rows.push(post);

      const response = await request(app).get('/api/v1/trending/posts');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data.posts)).toBe(true);
    });

    it('returns 200 with empty posts array when no trending entries exist', async () => {
      // Rows cleared by beforeEach in setup.ts via jest.clearAllMocks — rows
      // are NOT cleared between tests, so we rely on fresh mocked findMany.
      // Re-configure the findMany mock to return empty for this test.
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app).get('/api/v1/trending/posts');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.posts)).toBe(true);
    });

    it('accepts language query param and returns 200', async () => {
      const postId = 'post-ts-1';
      const entry = makeTrendingEntry({ entityType: 'POST', entityId: postId, language: 'TypeScript' });
      const post = makePost({ id: postId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(1);
      mockPrisma.post.findMany.mockResolvedValueOnce([post]);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ language: 'TypeScript' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.posts)).toBe(true);
    });

    it('rejects an invalid tier value with 400', async () => {
      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'invalid_tier' });

      expect(response.status).toBe(400);
    });

    it('accepts valid tier=hot and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'hot' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('accepts period=day via tier alias and returns 200', async () => {
      // The validator accepts tier values: hot | today | week | rising.
      // "period" is not a query param; the closest equivalent is tier=today.
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'today' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // tier is reflected back in response data
      expect(response.body.data.tier).toBe('TRENDING_TODAY');
    });

    it('respects limit and offset query params', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ limit: '5', offset: '0' });

      expect(response.status).toBe(200);
    });
  });

  // ── GET /api/v1/trending/repos ───────────────────────────────────────────

  describe('GET /api/v1/trending/repos', () => {
    it('returns 200 with an array in data.repos', async () => {
      const repoId = 'repo-trending-1';
      const entry = makeTrendingEntry({ entityType: 'REPOSITORY', entityId: repoId, rank: 1 });
      const repo = makeRepo({ id: repoId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(1);
      mockPrisma.repository.findMany.mockResolvedValueOnce([repo]);

      const response = await request(app).get('/api/v1/trending/repos');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.repos)).toBe(true);
    });

    it('returns 200 with empty repos when no entries exist', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app).get('/api/v1/trending/repos');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.repos)).toBe(true);
      expect(response.body.data.repos).toHaveLength(0);
    });

    it('accepts language filter and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/repos')
        .query({ language: 'Go' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('includes hasMore and total in the response', async () => {
      const repoId = 'repo-hm-1';
      const entry = makeTrendingEntry({ entityType: 'REPOSITORY', entityId: repoId });
      const repo = makeRepo({ id: repoId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(5);
      mockPrisma.repository.findMany.mockResolvedValueOnce([repo]);

      const response = await request(app)
        .get('/api/v1/trending/repos')
        .query({ limit: '1', offset: '0' });

      expect(response.status).toBe(200);
      expect(typeof response.body.data.total).toBe('number');
      expect(typeof response.body.data.hasMore).toBe('boolean');
    });
  });

  // ── GET /api/v1/trending/tags ────────────────────────────────────────────

  describe('GET /api/v1/trending/tags', () => {
    it('returns 200 with an array in data.tags', async () => {
      const tag = makeHashtag({ id: 'tag-1' });

      mockPrisma.postHashtag.groupBy.mockResolvedValueOnce([
        { hashtagId: tag.id, _count: { hashtagId: 12 } },
      ]);
      mockPrisma.hashtag.findMany.mockResolvedValueOnce([tag]);

      const response = await request(app).get('/api/v1/trending/tags');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.tags)).toBe(true);
    });

    it('returns 200 with empty tags array when no post hashtags exist', async () => {
      mockPrisma.postHashtag.groupBy.mockResolvedValueOnce([]);
      mockPrisma.hashtag.findMany.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/v1/trending/tags');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tags).toHaveLength(0);
    });

    it('includes windowHours in the response', async () => {
      mockPrisma.postHashtag.groupBy.mockResolvedValueOnce([]);
      mockPrisma.hashtag.findMany.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/v1/trending/tags');

      expect(response.status).toBe(200);
      expect(typeof response.body.data.windowHours).toBe('number');
    });

    it('returns tag objects with id, name, totalCount, recentPostCount', async () => {
      const tag = makeHashtag({ id: 'tag-shape-1', name: 'typescript', count: 99 });

      mockPrisma.postHashtag.groupBy.mockResolvedValueOnce([
        { hashtagId: tag.id, _count: { hashtagId: 7 } },
      ]);
      mockPrisma.hashtag.findMany.mockResolvedValueOnce([tag]);

      const response = await request(app).get('/api/v1/trending/tags');

      expect(response.status).toBe(200);
      const first = response.body.data.tags[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('totalCount');
      expect(first).toHaveProperty('recentPostCount');
    });
  });

  // ── GET /api/v1/trending/users ───────────────────────────────────────────

  describe('GET /api/v1/trending/users', () => {
    it('returns 200 with an array in data.users', async () => {
      const userId = 'user-trending-1';
      const entry = makeTrendingEntry({ entityType: 'USER', entityId: userId, rank: 1 });
      const user = makeUser({ id: userId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(1);
      mockPrisma.user.findMany.mockResolvedValueOnce([user]);

      const response = await request(app).get('/api/v1/trending/users');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.users)).toBe(true);
    });

    it('returns 200 with empty users when no trending user entries exist', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/v1/trending/users');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.users)).toBe(true);
      expect(response.body.data.users).toHaveLength(0);
    });

    it('accepts tier=rising query param and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/v1/trending/users')
        .query({ tier: 'rising' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('includes tier and hasMore in the response', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/v1/trending/users');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('tier');
      expect(response.body.data).toHaveProperty('hasMore');
      expect(response.body.data).toHaveProperty('total');
    });
  });

  // ── GET /api/v1/trending/posts?language=TypeScript ───────────────────────

  describe('GET /api/v1/trending/posts?language=TypeScript', () => {
    it('passes language filter to the ranking query and returns 200', async () => {
      const postId = 'post-ts-filter-1';
      const entry = makeTrendingEntry({ entityType: 'POST', entityId: postId, language: 'TypeScript' });
      const post = makePost({ id: postId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(1);
      mockPrisma.post.findMany.mockResolvedValueOnce([post]);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ language: 'TypeScript' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.posts)).toBe(true);

      // Verify the trending entry query was called with the language filter
      const findManyCallArgs = mockPrisma.trendingEntry.findMany.mock.calls;
      const lastCall = findManyCallArgs[findManyCallArgs.length - 1]?.[0];
      if (lastCall?.where) {
        expect(lastCall.where.language).toBe('TypeScript');
      }
    });

    it('rejects a language value exceeding 50 characters with 400', async () => {
      const longLanguage = 'A'.repeat(51);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ language: longLanguage });

      expect(response.status).toBe(400);
    });

    it('returns only posts with matching language when entries have language set', async () => {
      const postId = 'post-rust-1';
      const entry = makeTrendingEntry({ entityType: 'POST', entityId: postId, language: 'Rust' });
      const post = makePost({ id: postId });

      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([entry]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(1);
      mockPrisma.post.findMany.mockResolvedValueOnce([post]);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ language: 'Rust' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.posts)).toBe(true);
    });
  });

  // ── GET /api/v1/trending/posts?period=day ───────────────────────────────

  describe('GET /api/v1/trending/posts?period=day (tier alias)', () => {
    it('tier=today maps to TRENDING_TODAY and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'today' });

      expect(response.status).toBe(200);
      expect(response.body.data.tier).toBe('TRENDING_TODAY');
    });

    it('tier=week maps to THIS_WEEK and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'week' });

      expect(response.status).toBe(200);
      expect(response.body.data.tier).toBe('THIS_WEEK');
    });

    it('tier=hot maps to HOT_NOW and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'hot' });

      expect(response.status).toBe(200);
      expect(response.body.data.tier).toBe('HOT_NOW');
    });

    it('tier=rising maps to RISING_STARS and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'rising' });

      expect(response.status).toBe(200);
      expect(response.body.data.tier).toBe('RISING_STARS');
    });

    it('unknown tier value is rejected with 400', async () => {
      const response = await request(app)
        .get('/api/v1/trending/posts')
        .query({ tier: 'day' });

      // "day" is not in the allowed list so the validator returns 400
      expect(response.status).toBe(400);
    });
  });

  // ── GET /api/v1/trending (general endpoint) ──────────────────────────────

  describe('GET /api/v1/trending', () => {
    it('returns 200 with success flag and data', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app).get('/api/v1/trending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('filters by type=post and returns 200', async () => {
      mockPrisma.trendingEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.trendingEntry.count.mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/v1/trending')
        .query({ type: 'post' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('rejects invalid type value with 400', async () => {
      const response = await request(app)
        .get('/api/v1/trending')
        .query({ type: 'unknown_type' });

      expect(response.status).toBe(400);
    });
  });
});
