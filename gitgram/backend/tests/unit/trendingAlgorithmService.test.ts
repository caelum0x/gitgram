/**
 * Unit tests for trendingAlgorithmService.ts
 *
 * Covers:
 *  - computeTrendingScore: verifies the score formula with known inputs
 *  - getTrendingPosts: verifies sorting by score and network boost
 *  - getTrendingRepositories: verifies Redis cache usage and merged scoring
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that touch these modules
// ---------------------------------------------------------------------------

jest.mock('../../src/utils/prisma', () => ({
  __esModule: true,
  default: {
    follow: {
      findMany: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    repository: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/services/redisService', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/services/ghSocialBridge', () => ({
  fetchGitHubTrending: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import prisma from '../../src/utils/prisma';
import { cache } from '../../src/services/redisService';
import { fetchGitHubTrending } from '../../src/services/ghSocialBridge';
import {
  computeTrendingScore,
  getTrendingPosts,
  getTrendingRepositories,
  updateTrendingCache,
  type PostEngagementContext,
} from '../../src/services/trendingAlgorithmService';
import type { TrendingRepo } from '../../src/services/ghSocialBridge';

// Typed mock helpers
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockFetchGitHubTrending = fetchGitHubTrending as jest.MockedFunction<
  typeof fetchGitHubTrending
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PostEngagementContext with sensible defaults for test overrides. */
function makePost(overrides: Partial<PostEngagementContext> = {}): PostEngagementContext {
  return {
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    savesCount: 0,
    isFromFollowing: false,
    createdAt: new Date(), // "just now" — minimal decay
    ...overrides,
  };
}

/** Build a Prisma post row suitable for being returned by post.findMany. */
function makePrismaPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    userId: 'user-a',
    content: 'hello world',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    createdAt: new Date(),
    isArchived: false,
    status: 'PUBLISHED',
    user: { id: 'user-a', username: 'alice', avatar: null, verified: false },
    repository: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTrendingScore
// ---------------------------------------------------------------------------

describe('computeTrendingScore', () => {
  it('returns 0 for a post with no engagement, created just now', () => {
    const score = computeTrendingScore(makePost());
    // baseScore=0 → decayedScore=0 regardless of time factor
    expect(score).toBe(0);
  });

  it('applies correct weights: likes×2 + comments×3 + shares×2 + saves×1', () => {
    // Use a fixed createdAt = Date.now() so decay ≈ 1 (hours ≈ 0)
    const post = makePost({
      likesCount: 10,
      commentsCount: 5,
      sharesCount: 3,
      savesCount: 4,
      createdAt: new Date(),
    });

    const score = computeTrendingScore(post);

    // Expected base: 10*2 + 5*3 + 3*2 + 4*1 = 20 + 15 + 6 + 4 = 45
    // With hours ≈ 0: decay factor ≈ 1 → score ≈ 45
    expect(score).toBeCloseTo(45, 0);
  });

  it('adds 50 to base score when isFromFollowing is true', () => {
    const withoutFollow = computeTrendingScore(makePost({ likesCount: 10 }));
    const withFollow = computeTrendingScore(makePost({ likesCount: 10, isFromFollowing: true }));

    // The extra 50 from following should survive minimal decay
    expect(withFollow).toBeGreaterThan(withoutFollow);
    expect(withFollow - withoutFollow).toBeCloseTo(50, 0);
  });

  it('userContext.isFromFollowing overrides post.isFromFollowing', () => {
    const post = makePost({ isFromFollowing: false, likesCount: 5 });

    const withOverride = computeTrendingScore(post, { isFromFollowing: true });
    const withoutOverride = computeTrendingScore(post, { isFromFollowing: false });

    expect(withOverride).toBeGreaterThan(withoutOverride);
  });

  it('applies exponential time decay for older posts', () => {
    const recentPost = makePost({ likesCount: 20, createdAt: new Date() });
    const oldPost = makePost({
      likesCount: 20,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
    });

    const recentScore = computeTrendingScore(recentPost);
    const oldScore = computeTrendingScore(oldPost);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('computes exact score for known inputs at zero hours age', () => {
    // Pin createdAt to exactly now so we can predict the formula precisely
    const now = new Date();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const post = makePost({
      likesCount: 4,
      commentsCount: 2,
      sharesCount: 1,
      savesCount: 3,
      isFromFollowing: false,
      createdAt: now,
    });

    const score = computeTrendingScore(post);

    // baseScore = 4*2 + 2*3 + 1*2 + 3*1 = 8 + 6 + 2 + 3 = 19
    // hours = 0 → decay = e^0 = 1 → score = 19
    expect(score).toBeCloseTo(19, 5);

    jest.useRealTimers();
  });

  it('handles string createdAt the same as Date createdAt', () => {
    const now = new Date();
    const isoString = now.toISOString();

    const scoreFromDate = computeTrendingScore(makePost({ likesCount: 10, createdAt: now }));
    const scoreFromString = computeTrendingScore(makePost({ likesCount: 10, createdAt: isoString }));

    expect(scoreFromDate).toBeCloseTo(scoreFromString, 10);
  });
});

// ---------------------------------------------------------------------------
// getTrendingPosts
// ---------------------------------------------------------------------------

describe('getTrendingPosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns posts sorted by descending score', async () => {
    const now = new Date();

    // User follows nobody
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([]);

    // Two posts: low-engagement (id: post-low) and high-engagement (id: post-high)
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([
      makePrismaPost({ id: 'post-low', likesCount: 1, commentsCount: 0, sharesCount: 0, viewsCount: 0, createdAt: now }),
      makePrismaPost({ id: 'post-high', likesCount: 50, commentsCount: 20, sharesCount: 10, viewsCount: 0, createdAt: now }),
    ]);

    const results = await getTrendingPosts('user-x');

    expect(results.length).toBe(2);
    expect(results[0].postId).toBe('post-high');
    expect(results[1].postId).toBe('post-low');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('applies 2× network boost to posts from followed users', async () => {
    const now = new Date();

    // user-x follows user-friend
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([
      { followingUserId: 'user-friend' },
    ]);

    const identicalEngagement = { likesCount: 10, commentsCount: 5, sharesCount: 2, viewsCount: 0, createdAt: now };

    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([
      makePrismaPost({ id: 'post-stranger', userId: 'user-stranger', ...identicalEngagement }),
      makePrismaPost({ id: 'post-friend', userId: 'user-friend', ...identicalEngagement }),
    ]);

    const results = await getTrendingPosts('user-x');

    const friendPost = results.find((r) => r.postId === 'post-friend')!;
    const strangerPost = results.find((r) => r.postId === 'post-stranger')!;

    // Friend's post should have a higher score due to 2× network boost
    expect(friendPost.score).toBeGreaterThan(strangerPost.score);
    expect(results[0].postId).toBe('post-friend');
  });

  it('respects the limit parameter', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([]);

    const posts = Array.from({ length: 10 }, (_, i) =>
      makePrismaPost({ id: `post-${i}`, likesCount: i })
    );
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue(posts);

    const results = await getTrendingPosts('user-x', 3);

    expect(results.length).toBe(3);
  });

  it('returns an empty array when there are no recent posts', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([]);

    const results = await getTrendingPosts('user-x');

    expect(results).toEqual([]);
  });

  it('degrades gracefully when follow lookup fails', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([
      makePrismaPost({ id: 'post-1', likesCount: 5 }),
    ]);

    // Should not throw — falls back to empty followedUserIds set
    const results = await getTrendingPosts('user-x');

    expect(results.length).toBe(1);
    expect(results[0].postId).toBe('post-1');
  });

  it('includes expected shape in returned results', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([]);
    const prismaPost = makePrismaPost({
      id: 'post-shape',
      userId: 'user-a',
      content: 'test content',
      likesCount: 3,
      commentsCount: 1,
      sharesCount: 0,
      viewsCount: 10,
    });
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([prismaPost]);

    const [result] = await getTrendingPosts('user-x');

    expect(result).toMatchObject({
      postId: 'post-shape',
      score: expect.any(Number),
      post: expect.objectContaining({
        id: 'post-shape',
        userId: 'user-a',
        content: 'test content',
        likesCount: 3,
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// getTrendingRepositories
// ---------------------------------------------------------------------------

describe('getTrendingRepositories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeGitgramRepo = (overrides: Record<string, unknown> = {}) => ({
    id: 'repo-1',
    fullName: 'alice/my-lib',
    owner: 'alice',
    name: 'my-lib',
    language: 'TypeScript',
    stars: 100,
    forks: 20,
    description: 'A cool library',
    _count: { followers: 5 },
    ...overrides,
  });

  const makeGitHubRepo = (overrides: Partial<TrendingRepo> = {}): TrendingRepo => ({
    owner: 'alice',
    name: 'my-lib',
    description: 'GitHub description',
    stars: 200,
    language: 'TypeScript',
    url: 'https://github.com/alice/my-lib',
    ...overrides,
  });

  it('returns repositories sorted by descending score', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([
      makeGitgramRepo({ id: 'repo-low', fullName: 'bob/simple', stars: 1, forks: 0, _count: { followers: 0 } }),
      makeGitgramRepo({ id: 'repo-high', fullName: 'alice/popular', stars: 10000, forks: 1000, _count: { followers: 50 } }),
    ]);
    mockFetchGitHubTrending.mockResolvedValue([]);

    const results = await getTrendingRepositories();

    expect(results[0].fullName).toBe('alice/popular');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('marks a repo as source=gitgram when it only appears locally', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([makeGitgramRepo()]);
    mockFetchGitHubTrending.mockResolvedValue([]);

    const [result] = await getTrendingRepositories();

    expect(result.source).toBe('gitgram');
    expect(result.repository).toBeDefined();
    expect(result.githubData).toBeUndefined();
  });

  it('marks a repo as source=github when it only appears in GitHub trending', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([]);
    mockFetchGitHubTrending.mockResolvedValue([
      makeGitHubRepo({ owner: 'org', name: 'new-thing', stars: 500 }),
    ]);

    const [result] = await getTrendingRepositories();

    expect(result.source).toBe('github');
    expect(result.githubData).toBeDefined();
    expect(result.repository).toBeUndefined();
  });

  it('marks a repo as source=both and combines scores when present in both sources', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([makeGitgramRepo()]);
    mockFetchGitHubTrending.mockResolvedValue([makeGitHubRepo()]);

    const [result] = await getTrendingRepositories();

    expect(result.source).toBe('both');
    expect(result.githubData).toBeDefined();
    expect(result.repository).toBeDefined();

    // Combined score must exceed Gitgram-only score
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([makeGitgramRepo()]);
    mockFetchGitHubTrending.mockResolvedValue([]);
    const [gitgramOnlyResult] = await getTrendingRepositories();

    expect(result.score).toBeGreaterThan(gitgramOnlyResult.score);
  });

  it('respects the limit parameter', async () => {
    const repos = Array.from({ length: 10 }, (_, i) =>
      makeGitgramRepo({ id: `repo-${i}`, fullName: `user/repo-${i}`, stars: i * 10 })
    );
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue(repos);
    mockFetchGitHubTrending.mockResolvedValue([]);

    const results = await getTrendingRepositories(3);

    expect(results.length).toBe(3);
  });

  it('returns an empty array when both sources fail', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    mockFetchGitHubTrending.mockRejectedValue(new Error('GitHub API error'));

    const results = await getTrendingRepositories();

    expect(results).toEqual([]);
  });

  it('still returns Gitgram repos when GitHub trending fails', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([makeGitgramRepo()]);
    mockFetchGitHubTrending.mockRejectedValue(new Error('GitHub API down'));

    const results = await getTrendingRepositories();

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('gitgram');
  });

  it('still returns GitHub repos when Gitgram DB fails', async () => {
    (mockPrisma.repository.findMany as jest.Mock).mockRejectedValue(new Error('DB down'));
    mockFetchGitHubTrending.mockResolvedValue([makeGitHubRepo()]);

    const results = await getTrendingRepositories();

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('github');
  });

  it('computes gitgram score as log10(stars)*10 + log10(forks)*5 + followers*2', async () => {
    const stars = 1000;
    const forks = 100;
    const followers = 8;

    (mockPrisma.repository.findMany as jest.Mock).mockResolvedValue([
      makeGitgramRepo({ stars, forks, _count: { followers } }),
    ]);
    mockFetchGitHubTrending.mockResolvedValue([]);

    const [result] = await getTrendingRepositories();

    const expectedScore =
      Math.log10(stars) * 10 + Math.log10(forks) * 5 + followers * 2;

    expect(result.score).toBeCloseTo(expectedScore, 5);
  });
});

// ---------------------------------------------------------------------------
// updateTrendingCache
// ---------------------------------------------------------------------------

describe('updateTrendingCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes trending posts to Redis under the correct cache key', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.post.findMany as jest.Mock).mockResolvedValue([
      makePrismaPost({ id: 'post-cache', likesCount: 5 }),
    ]);
    mockCache.set.mockResolvedValue(undefined);

    await updateTrendingCache('user-42');

    expect(mockCache.set).toHaveBeenCalledTimes(1);
    const [key, value, ttl] = (mockCache.set as jest.Mock).mock.calls[0];
    expect(key).toBe('trending:posts:user-42');
    expect(Array.isArray(value)).toBe(true);
    expect(typeof ttl).toBe('number');
    expect(ttl).toBeGreaterThan(0);
  });

  it('does not throw when getTrendingPosts or cache.set fails', async () => {
    (mockPrisma.follow.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    (mockPrisma.post.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(updateTrendingCache('user-42')).resolves.toBeUndefined();
  });
});
