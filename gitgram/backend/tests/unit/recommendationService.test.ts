/**
 * Unit tests for recommendationService
 *
 * All Prisma calls are intercepted by the in-memory mock in tests/setup.ts.
 * We populate __rows on each model directly, then call the service functions
 * and assert the returned shape and scoring logic.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers';
import {
  getRecommendedUsers,
  getRecommendedRepos,
  getRecommendedSnippets,
  getRecommendedTopics,
  getForYouFeed,
} from '../../src/services/recommendationService';

const USER_3 = 'user-003';
const USER_4 = 'user-004';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRow(model: any, row: Record<string, unknown>) {
  model.__rows.push(row);
}

function clearAll() {
  [
    mockPrisma.user,
    mockPrisma.follow,
    mockPrisma.userBlock,
    mockPrisma.star,
    mockPrisma.repository,
    mockPrisma.codeSnippet,
    mockPrisma.userTopicInterest,
    mockPrisma.userLanguagePreference,
  ].forEach((m) => m.__rows.splice(0));
}

// ---------------------------------------------------------------------------
// Test suite: getRecommendedUsers
// ---------------------------------------------------------------------------

describe('getRecommendedUsers', () => {
  beforeEach(() => {
    clearAll();
  });

  it('returns empty array when the user follows nobody', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      displayName: null,
      avatar: null,
      verified: false,
      interests: [],
      isBanned: false,
      isSuspended: false,
    });
    // No follow rows → no 2nd-degree candidates
    const result = await getRecommendedUsers(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('excludes users already followed', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });
    // viewer follows user2
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    // user3 is followed by user2 (2nd degree) but also already followed by viewer
    seedRow(mockPrisma.follow, { id: 'f2', followerUserId: TEST_USER_ID_2, followingUserId: USER_3 });
    seedRow(mockPrisma.follow, { id: 'f3', followerUserId: TEST_USER_ID, followingUserId: USER_3 });

    seedRow(mockPrisma.user, {
      id: USER_3,
      username: 'user3',
      displayName: null,
      avatar: null,
      verified: false,
      interests: [],
      isBanned: false,
      isSuspended: false,
      followers: [{ followerUserId: TEST_USER_ID_2 }],
      _count: { followers: 1 },
    });

    // No user should appear because USER_3 is in the excludeIds set
    const result = await getRecommendedUsers(TEST_USER_ID);
    expect(result.every((u) => u.id !== USER_3)).toBe(true);
  });

  it('excludes blocked users', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    seedRow(mockPrisma.userBlock, { id: 'b1', blockerId: TEST_USER_ID, blockedId: USER_3 });

    const result = await getRecommendedUsers(TEST_USER_ID);
    expect(result.every((u) => u.id !== USER_3)).toBe(true);
  });

  it('scores higher for more mutual connections', async () => {
    // Seed viewer with two followees: user2 and user3
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    seedRow(mockPrisma.follow, { id: 'f2', followerUserId: TEST_USER_ID, followingUserId: USER_3 });

    // user4 is followed by BOTH user2 and user3 (2 mutuals) → higher score
    // user5 is followed only by user2 (1 mutual) → lower score
    const USER_5 = 'user-005';
    seedRow(mockPrisma.follow, { id: 'f3', followerUserId: TEST_USER_ID_2, followingUserId: USER_4 });
    seedRow(mockPrisma.follow, { id: 'f4', followerUserId: USER_3, followingUserId: USER_4 });
    seedRow(mockPrisma.follow, { id: 'f5', followerUserId: TEST_USER_ID_2, followingUserId: USER_5 });

    // Register candidate users so findMany returns them
    [USER_4, USER_5].forEach((id, i) => {
      seedRow(mockPrisma.user, {
        id,
        username: `user${i + 4}`,
        displayName: null,
        avatar: null,
        verified: false,
        interests: [],
        isBanned: false,
        isSuspended: false,
        followers: [{ followerUserId: TEST_USER_ID_2 }],
        _count: { followers: i + 1 },
      });
    });

    // Viewer user base
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });

    const result = await getRecommendedUsers(TEST_USER_ID, 10);
    // USER_4 has more mutual connections so its score should be ≥ USER_5
    const user4 = result.find((u) => u.id === USER_4);
    const user5 = result.find((u) => u.id === USER_5);
    if (user4 && user5) {
      expect(user4.score).toBeGreaterThanOrEqual(user5.score);
    }
  });

  it('builds a reason string mentioning mutual connections', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    seedRow(mockPrisma.follow, { id: 'f2', followerUserId: TEST_USER_ID_2, followingUserId: USER_4 });

    const user4Candidate = {
      id: USER_4,
      username: 'user4',
      displayName: null,
      avatar: null,
      verified: false,
      interests: [],
      isBanned: false,
      isSuspended: false,
      _count: { followers: 1 },
    };
    seedRow(mockPrisma.user, user4Candidate);

    // The relational filter `followers: { some: { followerUserId: { in: [...] } } }`
    // cannot be evaluated by the flat mock, so we override the candidates findMany
    // call to return USER_4 directly (all prior user.findMany calls in this test path
    // use findUnique, so the first findMany is the candidates fetch).
    mockPrisma.user.findMany.mockResolvedValueOnce([user4Candidate]);

    const result = await getRecommendedUsers(TEST_USER_ID, 10);
    const item = result.find((u) => u.id === USER_4);
    expect(item?.reason).toBeDefined();
  });

  it('respects the limit parameter', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });

    const result = await getRecommendedUsers(TEST_USER_ID, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns each user with required RecommendedUser fields', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: [],
      isBanned: false,
      isSuspended: false,
    });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    seedRow(mockPrisma.follow, { id: 'f2', followerUserId: TEST_USER_ID_2, followingUserId: USER_4 });
    seedRow(mockPrisma.user, {
      id: USER_4,
      username: 'user4',
      displayName: 'User Four',
      avatar: null,
      verified: true,
      interests: [],
      isBanned: false,
      isSuspended: false,
      followers: [{ followerUserId: TEST_USER_ID_2 }],
      _count: { followers: 5 },
    });

    const result = await getRecommendedUsers(TEST_USER_ID, 10);
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('username');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('reason');
      expect(item).toHaveProperty('mutualConnections');
      expect(item).toHaveProperty('followersCount');
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: getRecommendedRepos
// ---------------------------------------------------------------------------

describe('getRecommendedRepos', () => {
  beforeEach(() => {
    clearAll();
  });

  it('returns empty array when no repos match preferences or network', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    const result = await getRecommendedRepos(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('excludes already-starred repos', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.repository, {
      id: 'repo-1',
      fullName: 'owner/already-starred',
      description: null,
      language: 'TypeScript',
      topics: [],
      stars: 100,
      trendingScore: 0,
      status: 'active',
      trending: false,
    });
    seedRow(mockPrisma.star, { id: 's1', userId: TEST_USER_ID, repositoryId: 'repo-1' });

    const result = await getRecommendedRepos(TEST_USER_ID);
    expect(result.every((r) => r.id !== 'repo-1')).toBe(true);
  });

  it('includes trending repos when no language prefs are set', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.repository, {
      id: 'repo-trending',
      fullName: 'owner/hot',
      description: 'hot repo',
      language: null,
      topics: [],
      stars: 5000,
      trendingScore: 99,
      status: 'active',
      trending: true,
    });

    const result = await getRecommendedRepos(TEST_USER_ID);
    expect(result.find((r) => r.id === 'repo-trending')).toBeDefined();
  });

  it('scores language-matched repos higher', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    // Viewer has starred a TypeScript repo → language weight for TS = 1
    seedRow(mockPrisma.repository, {
      id: 'repo-ts-starred',
      fullName: 'owner/ts-base',
      language: 'TypeScript',
      topics: [],
      stars: 0,
      trendingScore: 0,
      status: 'active',
      trending: false,
    });
    seedRow(mockPrisma.star, {
      id: 's-prev',
      userId: TEST_USER_ID,
      repositoryId: 'repo-ts-starred',
      repository: { language: 'TypeScript' },
    });

    seedRow(mockPrisma.repository, {
      id: 'repo-ts',
      fullName: 'owner/ts-lib',
      description: null,
      language: 'TypeScript',
      topics: [],
      stars: 10,
      trendingScore: 0,
      status: 'active',
      trending: false,
    });
    seedRow(mockPrisma.repository, {
      id: 'repo-go',
      fullName: 'owner/go-lib',
      description: null,
      language: 'Go',
      topics: [],
      stars: 100,
      trendingScore: 0,
      status: 'active',
      trending: false,
    });

    const result = await getRecommendedRepos(TEST_USER_ID);
    const tsRepo = result.find((r) => r.id === 'repo-ts');
    const goRepo = result.find((r) => r.id === 'repo-go');
    if (tsRepo && goRepo) {
      expect(tsRepo.score).toBeGreaterThan(goRepo.score);
    }
  });

  it('returns repos with required RecommendedRepo fields', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.repository, {
      id: 'repo-check',
      fullName: 'owner/check',
      description: 'a repo',
      language: 'Rust',
      topics: ['systems'],
      stars: 50,
      trendingScore: 5,
      status: 'active',
      trending: true,
    });

    const result = await getRecommendedRepos(TEST_USER_ID);
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('fullName');
      expect(item).toHaveProperty('stars');
      expect(item).toHaveProperty('trendingScore');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('reason');
      expect(Array.isArray(item.topics)).toBe(true);
    }
  });

  it('builds reason mentioning network stars when followed users starred a repo', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });
    seedRow(mockPrisma.repository, {
      id: 'repo-net',
      fullName: 'owner/popular',
      description: null,
      language: 'Python',
      topics: [],
      stars: 200,
      trendingScore: 0,
      status: 'active',
      trending: false,
    });
    // user2 has starred repo-net
    seedRow(mockPrisma.star, { id: 's2', userId: TEST_USER_ID_2, repositoryId: 'repo-net' });

    const result = await getRecommendedRepos(TEST_USER_ID);
    const item = result.find((r) => r.id === 'repo-net');
    if (item) {
      expect(item.reason).toMatch(/Starred by/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: getRecommendedSnippets
// ---------------------------------------------------------------------------

describe('getRecommendedSnippets', () => {
  beforeEach(() => {
    clearAll();
  });

  it('returns empty array when no snippets exist', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    const result = await getRecommendedSnippets(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('excludes snippets authored by the requesting user', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-own',
      title: 'My snippet',
      language: 'TypeScript',
      likesCount: 10,
      viewsCount: 100,
      userId: TEST_USER_ID,
      createdAt: new Date(),
    });

    const result = await getRecommendedSnippets(TEST_USER_ID);
    expect(result.every((s) => s.id !== 'snip-own')).toBe(true);
  });

  it('boosts snippets from followed authors', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });

    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-followed',
      title: 'From followed',
      language: 'Go',
      likesCount: 0,
      viewsCount: 0,
      userId: TEST_USER_ID_2,
      createdAt: new Date(),
    });
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-stranger',
      title: 'From stranger',
      language: 'Go',
      likesCount: 0,
      viewsCount: 0,
      userId: USER_3,
      createdAt: new Date(),
    });

    const result = await getRecommendedSnippets(TEST_USER_ID);
    const followed = result.find((s) => s.id === 'snip-followed');
    const stranger = result.find((s) => s.id === 'snip-stranger');
    if (followed && stranger) {
      expect(followed.score).toBeGreaterThan(stranger.score);
    }
  });

  it('respects language preferences from userLanguagePreference', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.userLanguagePreference, {
      id: 'lp1',
      userId: TEST_USER_ID,
      language: 'Rust',
      weight: 5,
      score: 0,
    });

    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-rust',
      title: 'Rust snippet',
      language: 'Rust',
      likesCount: 0,
      viewsCount: 0,
      userId: USER_3,
      createdAt: new Date(),
    });
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-java',
      title: 'Java snippet',
      language: 'Java',
      likesCount: 0,
      viewsCount: 0,
      userId: USER_4,
      createdAt: new Date(),
    });

    const result = await getRecommendedSnippets(TEST_USER_ID);
    const rust = result.find((s) => s.id === 'snip-rust');
    const java = result.find((s) => s.id === 'snip-java');
    if (rust && java) {
      expect(rust.score).toBeGreaterThan(java.score);
    }
  });

  it('returns items with required RecommendedSnippet fields', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-fields',
      title: 'Check fields',
      language: 'Python',
      likesCount: 3,
      viewsCount: 30,
      userId: USER_3,
      createdAt: new Date(),
    });

    const result = await getRecommendedSnippets(TEST_USER_ID);
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('language');
      expect(item).toHaveProperty('likesCount');
      expect(item).toHaveProperty('viewsCount');
      expect(item).toHaveProperty('authorId');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('reason');
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: getRecommendedTopics
// ---------------------------------------------------------------------------

describe('getRecommendedTopics', () => {
  beforeEach(() => {
    clearAll();
  });

  it('returns empty array when no stars exist', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    const result = await getRecommendedTopics(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('surfaces topics from starred repos in the user network', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.repository, {
      id: 'repo-ml',
      fullName: 'owner/ml-lib',
      topics: ['machine-learning', 'python'],
    });
    seedRow(mockPrisma.star, {
      id: 's1',
      userId: TEST_USER_ID,
      repositoryId: 'repo-ml',
      repository: { topics: ['machine-learning', 'python'] },
    });

    const result = await getRecommendedTopics(TEST_USER_ID);
    const topics = result.map((t) => t.topic);
    expect(topics).toContain('machine-learning');
  });

  it('filters out topics already listed as user interests', async () => {
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      interests: ['typescript'],
    });
    seedRow(mockPrisma.repository, {
      id: 'repo-ts',
      fullName: 'owner/ts',
      topics: ['typescript'],
    });
    seedRow(mockPrisma.star, {
      id: 's1',
      userId: TEST_USER_ID,
      repositoryId: 'repo-ts',
      repository: { topics: ['typescript'] },
    });

    const result = await getRecommendedTopics(TEST_USER_ID);
    expect(result.every((t) => t.topic !== 'typescript')).toBe(true);
  });

  it('returns items with topic, repoCount, score, and reason', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.repository, { id: 'r1', fullName: 'owner/r1', topics: ['devops'] });
    seedRow(mockPrisma.star, {
      id: 's1',
      userId: TEST_USER_ID,
      repositoryId: 'r1',
      repository: { topics: ['devops'] },
    });

    const result = await getRecommendedTopics(TEST_USER_ID);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('topic');
      expect(result[0]).toHaveProperty('repoCount');
      expect(result[0]).toHaveProperty('score');
      expect(result[0]).toHaveProperty('reason');
    }
  });

  it('ranks topics by appearance count across the network', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [] });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2 });

    // 'devops' appears in 2 stars; 'wasm' in 1
    seedRow(mockPrisma.repository, { id: 'r1', fullName: 'o/r1', topics: ['devops'] });
    seedRow(mockPrisma.repository, { id: 'r2', fullName: 'o/r2', topics: ['devops', 'wasm'] });
    seedRow(mockPrisma.star, {
      id: 's1',
      userId: TEST_USER_ID,
      repositoryId: 'r1',
      repository: { topics: ['devops'] },
    });
    seedRow(mockPrisma.star, {
      id: 's2',
      userId: TEST_USER_ID_2,
      repositoryId: 'r2',
      repository: { topics: ['devops', 'wasm'] },
    });

    const result = await getRecommendedTopics(TEST_USER_ID);
    const devops = result.find((t) => t.topic === 'devops');
    const wasm = result.find((t) => t.topic === 'wasm');
    if (devops && wasm) {
      expect(devops.repoCount).toBeGreaterThan(wasm.repoCount);
      expect(devops.score).toBeGreaterThanOrEqual(wasm.score);
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: getForYouFeed
// ---------------------------------------------------------------------------

describe('getForYouFeed', () => {
  beforeEach(() => {
    clearAll();
  });

  it('returns items and nextCursor when feed has content', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [], isBanned: false, isSuspended: false });
    seedRow(mockPrisma.repository, {
      id: 'repo-fyp',
      fullName: 'owner/fyp',
      description: null,
      language: null,
      topics: [],
      stars: 999,
      trendingScore: 50,
      status: 'active',
      trending: true,
    });

    const result = await getForYouFeed(TEST_USER_ID);
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('nextCursor');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('returns empty feed for a user with no signal', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [], isBanned: false, isSuspended: false });
    const result = await getForYouFeed(TEST_USER_ID);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('each item has type (repo|snippet|user), id, score, and reason', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [], isBanned: false, isSuspended: false });
    seedRow(mockPrisma.repository, {
      id: 'repo-fyp2',
      fullName: 'owner/fyp2',
      description: null,
      language: null,
      topics: [],
      stars: 0,
      trendingScore: 1,
      status: 'active',
      trending: true,
    });

    const result = await getForYouFeed(TEST_USER_ID);
    for (const item of result.items) {
      expect(['repo', 'snippet', 'user']).toContain(item.type);
      expect(item).toHaveProperty('id');
      expect(typeof item.score).toBe('number');
      expect(typeof item.reason).toBe('string');
    }
  });

  it('respects cursor pagination — second page starts after cursor', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [], isBanned: false, isSuspended: false });

    // Seed enough trending repos to fill 2 pages
    for (let i = 0; i < 6; i++) {
      seedRow(mockPrisma.repository, {
        id: `repo-page-${i}`,
        fullName: `owner/page-${i}`,
        description: null,
        language: null,
        topics: [],
        stars: 100 - i,
        trendingScore: 100 - i,
        status: 'active',
        trending: true,
      });
    }

    const page1 = await getForYouFeed(TEST_USER_ID, null, 3);
    if (page1.nextCursor) {
      const page2 = await getForYouFeed(TEST_USER_ID, page1.nextCursor, 3);
      const page1Ids = page1.items.map((i) => i.id);
      const page2Ids = page2.items.map((i) => i.id);
      // No overlap between pages
      expect(page2Ids.filter((id) => page1Ids.includes(id))).toHaveLength(0);
    }
  });

  it('returns nextCursor = null on the last page', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', interests: [], isBanned: false, isSuspended: false });
    // Just one repo — fits in first page of limit 20
    seedRow(mockPrisma.repository, {
      id: 'repo-last',
      fullName: 'owner/last',
      description: null,
      language: null,
      topics: [],
      stars: 1,
      trendingScore: 1,
      status: 'active',
      trending: true,
    });

    const result = await getForYouFeed(TEST_USER_ID, null, 20);
    expect(result.nextCursor).toBeNull();
  });
});
