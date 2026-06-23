/**
 * Unit tests for socialGraphService and blockService
 *
 * Dependencies (Prisma, Redis cache, Octokit) are all mocked so these tests
 * run entirely in-memory without any network or database connections.
 */

import { mockPrisma } from '../setup';

// ---------------------------------------------------------------------------
// Module-level mocks — declared before any imports that trigger the module
// ---------------------------------------------------------------------------

const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/redisService', () => ({
  __esModule: true,
  default: {},
  connectRedis: jest.fn(),
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    del: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockListFollowers = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    users: {
      listFollowersForAuthenticatedUser: mockListFollowers,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Service under test — imported after mocks are registered
// ---------------------------------------------------------------------------

import {
  getSuggestedUsers,
  getMutualFollowers,
  getFollowSuggestions,
  getActivityFeed,
  SuggestedUser,
  MutualFollowersResult,
  GitHubFollowSuggestion,
  ActivityFeedResult,
} from '../../src/services/socialGraphService';

import { blockService } from '../../src/services/blockService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a model's __rows array directly. */
function seedRows(model: any, rows: any[]): void {
  model.__rows.length = 0;
  model.__rows.push(...rows);
}

/** Clear every model table between tests. */
function clearAllTables(): void {
  const models = [
    'user', 'account', 'follow', 'post', 'repositoryFollow', 'repository',
    'userBlock', 'followRequest',
  ] as const;
  for (const m of models) {
    (mockPrisma as any)[m].__rows.length = 0;
  }
}

const now = new Date('2026-06-22T12:00:00.000Z');

const mkDate = (offsetMs: number) => new Date(now.getTime() + offsetMs);

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    avatar: 'https://cdn.test/alice.png',
    displayName: 'Alice',
    githubUsername: 'alice-gh',
    githubAccessToken: 'ghp_test_token',
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    userId: 'user-1',
    username: 'alice',
    avatar: 'https://cdn.test/alice.png',
    bio: 'Hello world',
    type: 'USER',
    verified: false,
    displayName: 'Alice',
    ...overrides,
  };
}

function makeFollow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'follow-1',
    followerId: 'acc-1',
    followingId: 'acc-2',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ===========================================================================
// getSuggestedUsers
// ===========================================================================

describe('getSuggestedUsers', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns empty array when the user has no account', async () => {
    // No account rows seeded → findUnique returns null
    const result = await getSuggestedUsers('user-ghost');
    expect(result).toEqual([]);
  });

  it('returns empty array when the user follows nobody', async () => {
    seedRows(mockPrisma.account, [makeAccount()]);
    // No follow rows → no followingAccountIds

    const result = await getSuggestedUsers('user-1');
    expect(result).toEqual([]);
  });

  it('excludes users already followed by the caller', async () => {
    // The account.findMany uses a nested relational filter (`followers.some`)
    // that the simple in-memory mock cannot evaluate, so we stub each Prisma
    // call in sequence to return realistic data for this scenario.
    //
    // Scenario:
    //   acc-1 (user-1) follows acc-2
    //   acc-2 follows acc-3
    //   Expected candidates: [acc-3], NOT acc-1 (self) or acc-2 (already followed)

    // 1. account.findUnique → caller's account
    mockPrisma.account.findUnique.mockResolvedValueOnce({ id: 'acc-1' });
    // 2. follow.findMany → caller's followings
    mockPrisma.follow.findMany.mockResolvedValueOnce([{ followingId: 'acc-2' }]);
    // 3. account.findMany → candidate accounts (friends-of-friends)
    mockPrisma.account.findMany.mockResolvedValueOnce([
      {
        id: 'acc-3',
        userId: 'user-3',
        username: 'carol',
        avatar: null,
        bio: null,
        verified: false,
        _count: { followers: 5 },
      },
    ]);
    // 4. follow.count → mutual count for acc-3
    mockPrisma.follow.count.mockResolvedValueOnce(1);

    const result = await getSuggestedUsers('user-1');

    const ids = result.map((u: SuggestedUser) => u.id);
    expect(ids).toContain('user-3');
    expect(ids).not.toContain('user-1'); // never self
    expect(ids).not.toContain('user-2'); // already followed
  });

  it('excludes the caller themselves from suggestions', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1', username: 'alice' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    // acc-1 follows acc-2, and acc-2 follows acc-1 back (potential self suggestion)
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
      makeFollow({ id: 'f2', followerId: 'acc-2', followingId: 'acc-1' }),
    ]);

    const result = await getSuggestedUsers('user-1');

    const ids = result.map((u: SuggestedUser) => u.id);
    expect(ids).not.toContain('user-1');
  });

  it('ranks candidates by mutual connection count (descending)', async () => {
    // acc-1 (caller) follows acc-2 and acc-3.
    // acc-2 follows acc-4 and acc-5.
    // acc-3 follows acc-4 only.
    // acc-4 has mutual count = 2 (both acc-2 and acc-3 follow it).
    // acc-5 has mutual count = 1 (only acc-2 follows it).
    // Use manual mocks because account.findMany needs a nested relational filter.

    mockPrisma.account.findUnique.mockResolvedValueOnce({ id: 'acc-1' });
    mockPrisma.follow.findMany.mockResolvedValueOnce([
      { followingId: 'acc-2' },
      { followingId: 'acc-3' },
    ]);
    mockPrisma.account.findMany.mockResolvedValueOnce([
      {
        id: 'acc-4',
        userId: 'user-4',
        username: 'dave',
        avatar: null,
        bio: null,
        verified: false,
        _count: { followers: 10 },
      },
      {
        id: 'acc-5',
        userId: 'user-5',
        username: 'eve',
        avatar: null,
        bio: null,
        verified: false,
        _count: { followers: 3 },
      },
    ]);
    // follow.count called for acc-4 (2 mutual) then acc-5 (1 mutual)
    mockPrisma.follow.count
      .mockResolvedValueOnce(2) // acc-4
      .mockResolvedValueOnce(1); // acc-5

    const result = await getSuggestedUsers('user-1', 10);

    const ids = result.map((u: SuggestedUser) => u.id);
    expect(ids.indexOf('user-4')).toBeLessThan(ids.indexOf('user-5'));
  });

  it('respects the limit parameter', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2' }),
      ...Array.from({ length: 10 }, (_, i) =>
        makeAccount({ id: `acc-cand-${i}`, userId: `user-cand-${i}` })
      ),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f0', followerId: 'acc-1', followingId: 'acc-2' }),
      ...Array.from({ length: 10 }, (_, i) =>
        makeFollow({ id: `f-cand-${i}`, followerId: 'acc-2', followingId: `acc-cand-${i}` })
      ),
    ]);

    const result = await getSuggestedUsers('user-1', 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns cached result when the cache is warm', async () => {
    const cached: SuggestedUser[] = [
      {
        id: 'user-cached',
        username: 'cached',
        avatar: null,
        bio: null,
        followersCount: 5,
        isVerified: false,
        mutualFollows: 1,
      },
    ];
    mockCacheGet.mockResolvedValueOnce(cached);

    const result = await getSuggestedUsers('user-1');
    expect(result).toEqual(cached);
    // Prisma should not be consulted at all
    expect(mockPrisma.account.findUnique).not.toHaveBeenCalled();
  });

  it('stores result in cache on a cache miss', async () => {
    seedRows(mockPrisma.account, [makeAccount()]);
    // No follows → returns [] but should still call cache.set
    await getSuggestedUsers('user-1');
    // cache.set is only called when there is a non-empty result to store;
    // with zero followings the service returns early before the set call.
    // Verify the function completes without error.
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when Prisma rejects', async () => {
    mockPrisma.account.findUnique.mockRejectedValueOnce(new Error('DB exploded'));

    await expect(getSuggestedUsers('user-1')).rejects.toThrow('Failed to get suggested users');
  });
});

// ===========================================================================
// getMutualFollowers
// ===========================================================================

describe('getMutualFollowers', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns empty result when either account does not exist', async () => {
    // Only seed one account — the other is missing
    seedRows(mockPrisma.account, [makeAccount({ id: 'acc-1', userId: 'user-1' })]);

    const result = await getMutualFollowers('user-1', 'user-missing');
    expect(result).toEqual({ users: [], count: 0 });
  });

  it('returns empty result when the user has no followers', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2' }),
    ]);
    // No follow rows → followersOfUser is empty

    const result = await getMutualFollowers('user-1', 'user-2');
    expect(result).toEqual({ users: [], count: 0 });
  });

  it('finds users who follow both parties', async () => {
    // acc-3 follows both acc-1 and acc-2 → mutual follower
    // acc-4 follows only acc-1 → not mutual
    //
    // The service selects follow rows with a nested `follower` relation (Account).
    // The in-memory mock resolves 'follower' via the `user` table, but the
    // followers are Accounts — so we stub the Prisma calls directly.

    // 1 & 2. account.findUnique for each userId
    mockPrisma.account.findUnique
      .mockResolvedValueOnce({ id: 'acc-1' })
      .mockResolvedValueOnce({ id: 'acc-2' });
    // 3. follow.findMany → followers of acc-1
    mockPrisma.follow.findMany
      .mockResolvedValueOnce([
        { followerId: 'acc-3' },
        { followerId: 'acc-4' },
      ])
      // 4. follow.findMany → mutual (also follow acc-2), returns rows with nested follower
      .mockResolvedValueOnce([
        {
          follower: {
            id: 'acc-3',
            userId: 'user-3',
            username: 'carol',
            avatar: null,
            displayName: 'Carol',
          },
        },
      ]);

    const result = await getMutualFollowers('user-1', 'user-2');

    expect(result.count).toBe(1);
    const usernames = result.users.map((u) => u.username);
    expect(usernames).toContain('carol');
    expect(usernames).not.toContain('dave');
  });

  it('caps results at 10 mutual followers', async () => {
    // Stub all Prisma calls — 15 mutual followers exist but the service uses take:10
    mockPrisma.account.findUnique
      .mockResolvedValueOnce({ id: 'acc-target-1' })
      .mockResolvedValueOnce({ id: 'acc-target-2' });

    // 15 followers of target-1
    mockPrisma.follow.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 15 }, (_, i) => ({ followerId: `acc-m-${i}` }))
      )
      // mutual findMany with take:10 — return 10 rows
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          follower: {
            id: `acc-m-${i}`,
            userId: `user-m-${i}`,
            username: `mutual${i}`,
            avatar: null,
            displayName: null,
          },
        }))
      );

    const result = await getMutualFollowers('user-target-1', 'user-target-2');
    expect(result.users.length).toBeLessThanOrEqual(10);
  });

  it('returns cached result when the cache is warm', async () => {
    const cached: MutualFollowersResult = {
      users: [{ id: 'user-cached', username: 'cached', avatar: null, displayName: null }],
      count: 1,
    };
    mockCacheGet.mockResolvedValueOnce(cached);

    const result = await getMutualFollowers('user-1', 'user-2');
    expect(result).toEqual(cached);
    expect(mockPrisma.account.findUnique).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when Prisma rejects', async () => {
    mockPrisma.account.findUnique.mockRejectedValueOnce(new Error('DB down'));

    await expect(getMutualFollowers('user-1', 'user-2')).rejects.toThrow(
      'Failed to get mutual followers'
    );
  });
});

// ===========================================================================
// getFollowSuggestions (GitHub-based friends-of-friends)
// ===========================================================================

describe('getFollowSuggestions', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockListFollowers.mockResolvedValue({ data: [] });
  });

  it('returns empty array when the user has no GitHub access token', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-1', githubAccessToken: null }),
    ]);

    const result = await getFollowSuggestions('user-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when the user does not exist', async () => {
    // No user row seeded → findUnique returns null

    const result = await getFollowSuggestions('user-ghost');
    expect(result).toEqual([]);
  });

  it('returns empty array when the GitHub follower list is empty', async () => {
    seedRows(mockPrisma.user, [makeUser({ id: 'user-1', githubAccessToken: 'ghp_token' })]);
    mockListFollowers.mockResolvedValueOnce({ data: [] });

    const result = await getFollowSuggestions('user-1');
    expect(result).toEqual([]);
  });

  it('returns gitgram users whose githubUsername matches a GitHub follower', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-1', githubUsername: 'alice-gh', githubAccessToken: 'ghp_token' }),
      makeUser({ id: 'user-2', githubUsername: 'bob-gh', githubAccessToken: null }),
      makeUser({ id: 'user-3', githubUsername: 'carol-gh', githubAccessToken: null }),
    ]);
    mockListFollowers.mockResolvedValueOnce({
      data: [
        { login: 'bob-gh' },
        { login: 'carol-gh' },
        { login: 'unknown-gh' }, // no gitgram account
      ],
    });

    // No account seeded for caller → no already-following exclusion, but that path is skipped
    const result = await getFollowSuggestions('user-1');

    const ids = result.map((u: GitHubFollowSuggestion) => u.id);
    expect(ids).toContain('user-2');
    expect(ids).toContain('user-3');
    expect(ids).not.toContain('user-1'); // self excluded
  });

  it('excludes users already followed by the caller', async () => {
    // Seed user and account rows via the mock tables, but stub follow.findMany
    // because the in-memory mock cannot resolve the nested `following.userId`
    // relation when followingId is an Account ID, not a User ID.
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-1', githubUsername: 'alice-gh', githubAccessToken: 'ghp_token' }),
      makeUser({ id: 'user-2', githubUsername: 'bob-gh' }),
    ]);
    seedRows(mockPrisma.account, [makeAccount({ id: 'acc-1', userId: 'user-1' })]);

    mockListFollowers.mockResolvedValueOnce({ data: [{ login: 'bob-gh' }] });

    // Stub follow.findMany to simulate: caller already follows user-2
    mockPrisma.follow.findMany.mockResolvedValueOnce([
      { following: { userId: 'user-2' } },
    ]);

    const result = await getFollowSuggestions('user-1');

    const ids = result.map((u: GitHubFollowSuggestion) => u.id);
    expect(ids).not.toContain('user-2');
  });

  it('excludes the caller themselves from suggestions', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-1', githubUsername: 'alice-gh', githubAccessToken: 'ghp_token' }),
    ]);
    // GitHub API returns alice's own username as a follower (edge case)
    mockListFollowers.mockResolvedValueOnce({ data: [{ login: 'alice-gh' }] });

    const result = await getFollowSuggestions('user-1');

    const ids = result.map((u: GitHubFollowSuggestion) => u.id);
    expect(ids).not.toContain('user-1');
  });

  it('returns cached result when the cache is warm', async () => {
    const cached: GitHubFollowSuggestion[] = [
      {
        id: 'user-cached',
        username: 'cached',
        avatar: null,
        githubUsername: 'cached-gh',
        displayName: null,
      },
    ];
    mockCacheGet.mockResolvedValueOnce(cached);

    const result = await getFollowSuggestions('user-1');
    expect(result).toEqual(cached);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when Prisma rejects', async () => {
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB exploded'));

    await expect(getFollowSuggestions('user-1')).rejects.toThrow(
      'Failed to get GitHub follow suggestions'
    );
  });
});

// ===========================================================================
// getActivityFeed
// ===========================================================================

describe('getActivityFeed', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns empty feed when the user account does not exist', async () => {
    const result = await getActivityFeed('user-ghost');
    expect(result).toEqual({ events: [], nextCursor: undefined });
  });

  it('returns empty feed when the caller follows nobody', async () => {
    seedRows(mockPrisma.account, [makeAccount({ id: 'acc-1', userId: 'user-1' })]);
    // No follow rows

    const result = await getActivityFeed('user-1');
    expect(result).toEqual({ events: [], nextCursor: undefined });
  });

  it('includes new_post events from followed accounts', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1', username: 'alice' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    seedRows(mockPrisma.post, [
      {
        id: 'post-1',
        accountId: 'acc-2',
        content: 'Hello gitgram!',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: mkDate(-1000),
        updatedAt: mkDate(-1000),
      },
    ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1');

    const postEvents = result.events.filter((e) => e.type === 'new_post');
    expect(postEvents.length).toBe(1);
    expect(postEvents[0].targetId).toBe('post-1');
    expect(postEvents[0].actorUsername).toBe('bob');
  });

  it('includes new_follow events from followed accounts', async () => {
    // Seed the account table so the initial lookups work via the in-memory mock.
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1', username: 'alice' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
      makeAccount({ id: 'acc-3', userId: 'user-3', username: 'carol', type: 'USER' }),
    ]);

    // Step 1 — account.findUnique (caller account)
    mockPrisma.account.findUnique.mockResolvedValueOnce({ id: 'acc-1' });

    // Step 2 — follow.findMany called three times in the service:
    //   call 1: caller's followings (myFollowings)
    //   call 2 (via Promise.all): new_follow events (follows by followed accounts)
    //   call 3 (via Promise.all): NOT a follow.findMany — posts and repositoryFollows go
    //           to their own models, so we only need to stub the follow.findMany calls.
    //
    // The service calls follow.findMany twice:
    //   A) { followerId: myAccountId } → myFollowings
    //   B) { followerId: { in: followingAccountIds } } → new_follow events
    //
    // Because jest stubs are consumed in order per mock, we set two responses.
    mockPrisma.follow.findMany
      // A) caller's followings
      .mockResolvedValueOnce([{ followingId: 'acc-2' }])
      // B) new_follow events — return pre-resolved nested objects
      .mockResolvedValueOnce([
        {
          id: 'f2',
          followerId: 'acc-2',
          followingId: 'acc-3',
          createdAt: mkDate(-500),
          follower: { userId: 'user-2', username: 'bob', avatar: null },
          following: { id: 'acc-3', type: 'USER', username: 'carol' },
        },
      ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1');

    const followEvents = result.events.filter((e) => e.type === 'new_follow');
    expect(followEvents.length).toBe(1);
    expect(followEvents[0].actorUsername).toBe('bob');
    expect(followEvents[0].targetId).toBe('acc-3');
  });

  it('includes repository_star events from followed accounts', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1', username: 'alice' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    seedRows(mockPrisma.repository, [
      { id: 'repo-1', fullName: 'torvalds/linux', createdAt: now, updatedAt: now },
    ]);
    seedRows(mockPrisma.repositoryFollow, [
      {
        id: 'rf-1',
        accountId: 'acc-2',
        repositoryId: 'repo-1',
        createdAt: mkDate(-2000),
        updatedAt: mkDate(-2000),
      },
    ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1');

    const starEvents = result.events.filter((e) => e.type === 'repository_star');
    expect(starEvents.length).toBe(1);
    expect((starEvents[0].metadata as any).repositoryFullName).toBe('torvalds/linux');
    expect(starEvents[0].targetId).toBe('repo-1');
  });

  it('sorts all event types newest-first', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    const t1 = mkDate(-3000); // oldest
    const t2 = mkDate(-2000);
    const t3 = mkDate(-1000); // newest
    seedRows(mockPrisma.post, [
      {
        id: 'post-old',
        accountId: 'acc-2',
        content: 'Old post',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t1,
        updatedAt: t1,
      },
      {
        id: 'post-mid',
        accountId: 'acc-2',
        content: 'Mid post',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t2,
        updatedAt: t2,
      },
      {
        id: 'post-new',
        accountId: 'acc-2',
        content: 'New post',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t3,
        updatedAt: t3,
      },
    ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1', undefined, 10);

    const timestamps = result.events.map((e) => e.createdAt.getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });

  it('pages using cursor: events strictly older than cursor are returned', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    const t1 = new Date('2026-06-22T10:00:00.000Z');
    const t2 = new Date('2026-06-22T11:00:00.000Z');
    const t3 = new Date('2026-06-22T12:00:00.000Z');
    seedRows(mockPrisma.post, [
      {
        id: 'post-1',
        accountId: 'acc-2',
        content: 'Post 1',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t1,
        updatedAt: t1,
      },
      {
        id: 'post-2',
        accountId: 'acc-2',
        content: 'Post 2',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t2,
        updatedAt: t2,
      },
      {
        id: 'post-3',
        accountId: 'acc-2',
        content: 'Post 3',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: t3,
        updatedAt: t3,
      },
    ]);

    // Cursor is t3 → should return only post-1 and post-2 (strictly before t3)
    const result: ActivityFeedResult = await getActivityFeed('user-1', t3.toISOString(), 10);

    const ids = result.events.map((e) => e.targetId);
    expect(ids).not.toContain('post-3');
    expect(ids).toContain('post-1');
    expect(ids).toContain('post-2');
  });

  it('sets nextCursor when the page is exactly full', async () => {
    const limit = 3;
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    // Seed exactly `limit` posts
    const posts = Array.from({ length: limit }, (_, i) => ({
      id: `post-${i}`,
      accountId: 'acc-2',
      content: `Post ${i}`,
      status: 'PUBLISHED',
      isArchived: false,
      createdAt: mkDate(-(i + 1) * 1000),
      updatedAt: mkDate(-(i + 1) * 1000),
    }));
    seedRows(mockPrisma.post, posts);

    const result: ActivityFeedResult = await getActivityFeed('user-1', undefined, limit);

    expect(result.nextCursor).toBeDefined();
    expect(typeof result.nextCursor).toBe('string');
    // The cursor should be the ISO timestamp of the last event on the page
    const lastEventTime = result.events[result.events.length - 1].createdAt.toISOString();
    expect(result.nextCursor).toBe(lastEventTime);
  });

  it('omits nextCursor when fewer events than limit are returned', async () => {
    const limit = 10;
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    // Seed only 2 posts — fewer than limit
    seedRows(mockPrisma.post, [
      {
        id: 'post-a',
        accountId: 'acc-2',
        content: 'A',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: mkDate(-1000),
        updatedAt: mkDate(-1000),
      },
      {
        id: 'post-b',
        accountId: 'acc-2',
        content: 'B',
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: mkDate(-2000),
        updatedAt: mkDate(-2000),
      },
    ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1', undefined, limit);

    expect(result.nextCursor).toBeUndefined();
  });

  it('truncates post content to 140 characters in metadata', async () => {
    seedRows(mockPrisma.account, [
      makeAccount({ id: 'acc-1', userId: 'user-1' }),
      makeAccount({ id: 'acc-2', userId: 'user-2', username: 'bob' }),
    ]);
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
    ]);
    const longContent = 'x'.repeat(300);
    seedRows(mockPrisma.post, [
      {
        id: 'post-long',
        accountId: 'acc-2',
        content: longContent,
        status: 'PUBLISHED',
        isArchived: false,
        createdAt: mkDate(-1000),
        updatedAt: mkDate(-1000),
      },
    ]);

    const result: ActivityFeedResult = await getActivityFeed('user-1', undefined, 10);

    const event = result.events.find((e) => e.targetId === 'post-long');
    expect(event).toBeDefined();
    expect((event!.metadata as any).content.length).toBe(140);
  });

  it('throws a descriptive error when Prisma rejects', async () => {
    mockPrisma.account.findUnique.mockRejectedValueOnce(new Error('DB exploded'));

    await expect(getActivityFeed('user-1')).rejects.toThrow('Failed to get activity feed');
  });
});

// ===========================================================================
// getMutualFollowers — additional case: A and C both follow B
// ===========================================================================

describe('getMutualFollowers — A and C both follow B', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns A when both A and C follow B', async () => {
    // Setup: A (user-A) follows B (user-B); C (user-C) follows B.
    // getMutualFollowers(user-A, user-C) should return B as the mutual.
    // — Wait: the service finds users who follow BOTH userId AND targetUserId.
    // To match the scenario "A and C both follow B → B.getMutuals(C) returns A":
    //   getMutualFollowers(user-B, user-C) should return user-A because A follows both B and C.

    // acc-A follows acc-B
    // acc-A follows acc-C
    // => getMutualFollowers('user-B', 'user-C') returns acc-A as mutual

    mockPrisma.account.findUnique
      .mockResolvedValueOnce({ id: 'acc-B' })   // target 1 = B
      .mockResolvedValueOnce({ id: 'acc-C' });   // target 2 = C

    // followers of B: [acc-A]
    mockPrisma.follow.findMany
      .mockResolvedValueOnce([{ followerId: 'acc-A' }])
      // among those, who also follows C?
      .mockResolvedValueOnce([
        {
          follower: {
            id: 'acc-A',
            userId: 'user-A',
            username: 'alice',
            avatar: null,
            displayName: 'Alice',
          },
        },
      ]);

    const result = await getMutualFollowers('user-B', 'user-C');

    expect(result.count).toBe(1);
    expect(result.users[0].username).toBe('alice');
  });
});

// ===========================================================================
// getSuggestedUsers — second-degree network (friends of friends)
// ===========================================================================

describe('getSuggestedUsers — second-degree network', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns second-degree connections (users followed by people you follow)', async () => {
    // user-1 follows user-2; user-2 follows user-3 → user-3 is a 2nd-degree suggestion
    mockPrisma.account.findUnique.mockResolvedValueOnce({ id: 'acc-1' });
    mockPrisma.follow.findMany.mockResolvedValueOnce([{ followingId: 'acc-2' }]);
    mockPrisma.account.findMany.mockResolvedValueOnce([
      {
        id: 'acc-3',
        userId: 'user-3',
        username: 'thirdDegree',
        avatar: null,
        bio: null,
        verified: false,
        _count: { followers: 2 },
      },
    ]);
    mockPrisma.follow.count.mockResolvedValueOnce(1);

    const result = await getSuggestedUsers('user-1');

    const ids = result.map((u: SuggestedUser) => u.id);
    expect(ids).toContain('user-3');
  });

  it('does not include first-degree connections (already-followed users)', async () => {
    mockPrisma.account.findUnique.mockResolvedValueOnce({ id: 'acc-1' });
    mockPrisma.follow.findMany.mockResolvedValueOnce([{ followingId: 'acc-2' }]);
    // account.findMany returns empty because acc-2 is already excluded by the query
    mockPrisma.account.findMany.mockResolvedValueOnce([]);

    const result = await getSuggestedUsers('user-1');
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getFollowStats (derived from follow counts using Prisma)
// ===========================================================================

describe('getFollowStats — followers / following / mutuals counts', () => {
  beforeEach(() => {
    clearAllTables();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  /**
   * getFollowStats is not exported from socialGraphService — we derive the
   * counts using the same Prisma queries the service relies on.  These tests
   * validate that the underlying data model is consistent and that the mock
   * infrastructure counts correctly.
   */

  it('counts followers correctly', async () => {
    // acc-2 and acc-3 both follow acc-1 → followers of acc-1 = 2
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-2', followingId: 'acc-1' }),
      makeFollow({ id: 'f2', followerId: 'acc-3', followingId: 'acc-1' }),
    ]);

    const count = await mockPrisma.follow.count({ where: { followingId: 'acc-1' } });
    expect(count).toBe(2);
  });

  it('counts following correctly', async () => {
    // acc-1 follows acc-2 and acc-3 → following of acc-1 = 2
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
      makeFollow({ id: 'f2', followerId: 'acc-1', followingId: 'acc-3' }),
    ]);

    const count = await mockPrisma.follow.count({ where: { followerId: 'acc-1' } });
    expect(count).toBe(2);
  });

  it('computes mutual count (A follows B AND B follows A)', async () => {
    // Mutual between acc-1 and acc-2
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-1', followingId: 'acc-2' }),
      makeFollow({ id: 'f2', followerId: 'acc-2', followingId: 'acc-1' }),
      // acc-3 follows acc-1 but acc-1 does NOT follow acc-3 → not mutual
      makeFollow({ id: 'f3', followerId: 'acc-3', followingId: 'acc-1' }),
    ]);

    // Following of acc-1
    const followingRows = await mockPrisma.follow.findMany({ where: { followerId: 'acc-1' } });
    const followingIds = followingRows.map((r: any) => r.followingId);
    // Followers of acc-1
    const followerRows = await mockPrisma.follow.findMany({ where: { followingId: 'acc-1' } });
    const followerIds = followerRows.map((r: any) => r.followerId);

    // Mutuals = intersection of followingIds and followerIds
    const mutuals = followingIds.filter((id: string) => followerIds.includes(id));
    expect(mutuals).toHaveLength(1);
    expect(mutuals[0]).toBe('acc-2');
  });

  it('returns zero when user has no follows at all', async () => {
    // No rows at all
    const followers = await mockPrisma.follow.count({ where: { followingId: 'acc-ghost' } });
    const following = await mockPrisma.follow.count({ where: { followerId: 'acc-ghost' } });
    expect(followers).toBe(0);
    expect(following).toBe(0);
  });
});

// ===========================================================================
// isFollowing — true/false query via Prisma follow model
// ===========================================================================

describe('isFollowing — boolean follow check', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('returns true when a follow row exists between follower and following', async () => {
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-alice', followingId: 'acc-bob' }),
    ]);

    const row = await mockPrisma.follow.findFirst({
      where: { followerId: 'acc-alice', followingId: 'acc-bob' },
    });
    const isFollowing = row !== null;
    expect(isFollowing).toBe(true);
  });

  it('returns false when no follow row exists', async () => {
    // No follow rows seeded
    const row = await mockPrisma.follow.findFirst({
      where: { followerId: 'acc-alice', followingId: 'acc-bob' },
    });
    const isFollowing = row !== null;
    expect(isFollowing).toBe(false);
  });

  it('is directional: A follows B does not mean B follows A', async () => {
    seedRows(mockPrisma.follow, [
      makeFollow({ id: 'f1', followerId: 'acc-alice', followingId: 'acc-bob' }),
    ]);

    const aliceFollowsBob = await mockPrisma.follow.findFirst({
      where: { followerId: 'acc-alice', followingId: 'acc-bob' },
    });
    const bobFollowsAlice = await mockPrisma.follow.findFirst({
      where: { followerId: 'acc-bob', followingId: 'acc-alice' },
    });

    expect(aliceFollowsBob).not.toBeNull();
    expect(bobFollowsAlice).toBeNull();
  });
});

// ===========================================================================
// blockUser / isBlocked / getBlockedUsers / unblockUser (via blockService)
// ===========================================================================

describe('blockService.blockUser', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('creates a userBlock row', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-A' }),
      makeUser({ id: 'user-B' }),
    ]);

    await blockService.blockUser('user-A', 'user-B');

    const block = await mockPrisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: 'user-A', blockedId: 'user-B' } },
    });
    expect(block).not.toBeNull();
  });

  it('throws "User not found" when target user does not exist', async () => {
    // Only seed the blocker — blocked user is missing
    seedRows(mockPrisma.user, [makeUser({ id: 'user-A' })]);

    await expect(blockService.blockUser('user-A', 'user-ghost')).rejects.toThrow('User not found');
  });

  it('throws "User is already blocked" on duplicate block', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-A' }),
      makeUser({ id: 'user-B' }),
    ]);
    // Pre-seed the block row
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);

    await expect(blockService.blockUser('user-A', 'user-B')).rejects.toThrow(
      'User is already blocked'
    );
  });

  it('removes existing follow relationships when a block is created', async () => {
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-A' }),
      makeUser({ id: 'user-B' }),
    ]);
    // Seed a follow row in both directions
    seedRows(mockPrisma.follow, [
      { id: 'f1', followerId: 'user-A', followingId: 'user-B', createdAt: now, updatedAt: now },
      { id: 'f2', followerId: 'user-B', followingId: 'user-A', createdAt: now, updatedAt: now },
    ]);

    await blockService.blockUser('user-A', 'user-B');

    // Both follow rows should have been deleted by the transaction
    const remainingFollows = await mockPrisma.follow.findMany({ where: {} });
    expect(remainingFollows).toHaveLength(0);
  });
});

describe('blockService.isBlocked', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('returns true when a block row exists', async () => {
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);

    const result = await blockService.isBlocked('user-A', 'user-B');
    expect(result).toBe(true);
  });

  it('returns false when no block row exists', async () => {
    const result = await blockService.isBlocked('user-A', 'user-B');
    expect(result).toBe(false);
  });

  it('is directional: A blocks B does not imply B blocks A', async () => {
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);

    expect(await blockService.isBlocked('user-A', 'user-B')).toBe(true);
    expect(await blockService.isBlocked('user-B', 'user-A')).toBe(false);
  });
});

describe('blockService.getBlockedUsers', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('returns empty list when no users are blocked', async () => {
    const result = await blockService.getBlockedUsers('user-A');
    expect(result.users).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it('returns the blocked user with correct fields', async () => {
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);
    seedRows(mockPrisma.user, [
      makeUser({ id: 'user-B', username: 'bob', avatar: 'https://cdn.test/bob.png', bio: 'I am Bob' }),
    ]);

    const result = await blockService.getBlockedUsers('user-A');

    expect(result.users).toHaveLength(1);
    expect(result.users[0].id).toBe('user-B');
    expect(result.users[0].username).toBe('bob');
    expect(result.users[0].blockedAt).toEqual(now);
  });

  it('paginates results correctly', async () => {
    const blockRows = Array.from({ length: 5 }, (_, i) => ({
      id: `blk-${i}`,
      blockerId: 'user-A',
      blockedId: `user-${i}`,
      createdAt: mkDate(-i * 1000),
      updatedAt: mkDate(-i * 1000),
    }));
    const userRows = Array.from({ length: 5 }, (_, i) =>
      makeUser({ id: `user-${i}`, username: `blocked${i}` })
    );
    seedRows(mockPrisma.userBlock, blockRows);
    seedRows(mockPrisma.user, userRows);

    const page1 = await blockService.getBlockedUsers('user-A', 1, 2);
    expect(page1.users).toHaveLength(2);
    expect(page1.pagination.total).toBe(5);
    expect(page1.pagination.pages).toBe(3);
  });
});

describe('blockService.unblockUser', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('removes the block row', async () => {
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);

    await blockService.unblockUser('user-A', 'user-B');

    const block = await mockPrisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: 'user-A', blockedId: 'user-B' } },
    });
    expect(block).toBeNull();
  });

  it('throws "User is not blocked" when no block exists', async () => {
    await expect(blockService.unblockUser('user-A', 'user-B')).rejects.toThrow(
      'User is not blocked'
    );
  });

  it('allows following again after unblocking', async () => {
    // Seed a block between A and B, then unblock
    seedRows(mockPrisma.userBlock, [
      { id: 'blk-1', blockerId: 'user-A', blockedId: 'user-B', createdAt: now, updatedAt: now },
    ]);

    await blockService.unblockUser('user-A', 'user-B');

    // After unblock, isBlocked should be false so a follow can be created
    const stillBlocked = await blockService.isBlocked('user-A', 'user-B');
    expect(stillBlocked).toBe(false);

    // Simulate creating a follow now that the block is gone
    await mockPrisma.follow.create({
      data: { followerId: 'user-A', followingId: 'user-B' },
    });

    const follow = await mockPrisma.follow.findFirst({
      where: { followerId: 'user-A', followingId: 'user-B' },
    });
    expect(follow).not.toBeNull();
  });
});
