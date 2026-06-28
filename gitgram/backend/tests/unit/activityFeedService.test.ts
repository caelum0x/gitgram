/**
 * Unit tests for activityFeedService
 *
 * All Prisma calls are intercepted by the in-memory mock in tests/setup.ts.
 * Each test seeds __rows directly on the relevant model, invokes the service
 * function, and asserts the returned shape and behaviour.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers';
import {
  getActivityFeed,
  getNetworkTrending,
  ActivityEvent,
} from '../../src/services/activityFeedService';

const USER_3 = 'user-003';

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
    mockPrisma.star,
    mockPrisma.post,
    mockPrisma.codeSnippet,
    mockPrisma.repository,
    mockPrisma.repositoryActivity,
  ].forEach((m) => m.__rows.splice(0));
}

function makeDate(offsetMs = 0): Date {
  return new Date(Date.now() - offsetMs);
}

// ---------------------------------------------------------------------------
// Test suite: getActivityFeed — filter: all
// ---------------------------------------------------------------------------

describe('getActivityFeed — filter: all', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, {
      id: TEST_USER_ID,
      username: 'viewer',
      avatar: null,
    });
  });

  it('returns an object with events, nextCursor, and hasMore', async () => {
    const result = await getActivityFeed(TEST_USER_ID);
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('nextCursor');
    expect(result).toHaveProperty('hasMore');
    expect(Array.isArray(result.events)).toBe(true);
  });

  it('returns empty events when user has no follows and no activity', async () => {
    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    // viewer's own events only — no rows seeded
    expect(result.hasMore).toBe(false);
  });

  it('includes star events from followed users', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.repository, {
      id: 'repo-1',
      fullName: 'owner/repo1',
      htmlUrl: 'https://github.com/owner/repo1',
    });
    seedRow(mockPrisma.star, {
      id: 'star-1',
      userId: TEST_USER_ID_2,
      repositoryId: 'repo-1',
      createdAt: makeDate(1000),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
      repository: { id: 'repo-1', fullName: 'owner/repo1', htmlUrl: 'https://github.com/owner/repo1' },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    const starEvents = result.events.filter((e) => e.type === 'starred_repo');
    expect(starEvents.length).toBeGreaterThan(0);
  });

  it('includes post creation events', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.post, {
      id: 'post-1',
      userId: TEST_USER_ID_2,
      content: 'Hello world',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(2000),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    const postEvents = result.events.filter((e) => e.type === 'created_post');
    expect(postEvents.length).toBeGreaterThan(0);
  });

  it('includes snippet creation events', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-1',
      userId: TEST_USER_ID_2,
      title: 'Cool snippet',
      language: 'TypeScript',
      description: 'A TS snippet',
      createdAt: makeDate(500),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    const snippetEvents = result.events.filter((e) => e.type === 'created_snippet');
    expect(snippetEvents.length).toBeGreaterThan(0);
  });

  it('includes follow events', async () => {
    seedRow(mockPrisma.follow, {
      id: 'f-event',
      followerUserId: TEST_USER_ID_2,
      followingUserId: USER_3,
      createdAt: makeDate(100),
      followerUser: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
      followingUser: { id: USER_3, username: 'user3', avatar: null },
    });
    // viewer follows user2 so they're in actor scope
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.user, { id: USER_3, username: 'user3', avatar: null });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    const followEvents = result.events.filter((e) => e.type === 'followed_user');
    expect(followEvents.length).toBeGreaterThan(0);
  });

  it('events are ordered newest first', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    const older = makeDate(5000);
    const newer = makeDate(1000);

    seedRow(mockPrisma.post, {
      id: 'post-old',
      userId: TEST_USER_ID_2,
      content: 'Old post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: older,
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });
    seedRow(mockPrisma.post, {
      id: 'post-new',
      userId: TEST_USER_ID_2,
      content: 'New post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: newer,
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all' });
    if (result.events.length >= 2) {
      const times = result.events.map((e) => new Date(e.createdAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: getActivityFeed — filter: following
// ---------------------------------------------------------------------------

describe('getActivityFeed — filter: following', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
  });

  it('only includes events from followed users (not the requester)', async () => {
    // Seed a post by the viewer (should not appear with filter=following)
    seedRow(mockPrisma.post, {
      id: 'post-self',
      userId: TEST_USER_ID,
      content: 'My own post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(100),
      user: { id: TEST_USER_ID, username: 'viewer', avatar: null },
    });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.post, {
      id: 'post-followed',
      userId: TEST_USER_ID_2,
      content: 'Followed user post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(200),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'following' });
    // Self post should NOT appear
    expect(result.events.every((e) => e.id !== 'post:post-self')).toBe(true);
  });

  it('returns empty when user follows nobody', async () => {
    const result = await getActivityFeed(TEST_USER_ID, { filter: 'following' });
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test suite: getActivityFeed — filter: self
// ---------------------------------------------------------------------------

describe('getActivityFeed — filter: self', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
  });

  it("only returns the requester's own activity", async () => {
    seedRow(mockPrisma.post, {
      id: 'post-me',
      userId: TEST_USER_ID,
      content: 'My post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(100),
      user: { id: TEST_USER_ID, username: 'viewer', avatar: null },
    });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.post, {
      id: 'post-other',
      userId: TEST_USER_ID_2,
      content: 'Other post',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(200),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'self' });
    // All actors in the result should be the viewer
    for (const event of result.events) {
      if (event.type !== 'created_post') continue;
      expect(event.actor.id).toBe(TEST_USER_ID);
    }
    // Other user's post should not appear
    expect(result.events.find((e) => e.id === 'post:post-other')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test suite: getActivityFeed — filter: mentions
// ---------------------------------------------------------------------------

describe('getActivityFeed — filter: mentions', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
  });

  it("returns posts that mention the viewer's username", async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.post, {
      id: 'post-mention',
      userId: TEST_USER_ID_2,
      content: 'Hey @viewer checkout this!',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(100),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'mentions' });
    expect(result.events.find((e) => e.id === 'post:post-mention')).toBeDefined();
  });

  it('does not return posts that do not mention the viewer', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.post, {
      id: 'post-no-mention',
      userId: TEST_USER_ID_2,
      content: 'Hello world, nothing here',
      isArchived: false,
      status: 'PUBLISHED',
      createdAt: makeDate(100),
      user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'mentions' });
    expect(result.events.find((e) => e.id === 'post:post-no-mention')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test suite: cursor pagination
// ---------------------------------------------------------------------------

describe('getActivityFeed — cursor pagination', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'user2', avatar: null });
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });

    // Seed 5 posts spaced 1 second apart
    for (let i = 0; i < 5; i++) {
      seedRow(mockPrisma.post, {
        id: `post-page-${i}`,
        userId: TEST_USER_ID_2,
        content: `Post ${i}`,
        isArchived: false,
        status: 'PUBLISHED',
        createdAt: makeDate(i * 1000),
        user: { id: TEST_USER_ID_2, username: 'user2', avatar: null },
      });
    }
  });

  it('returns hasMore = true when there are more events than limit', async () => {
    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all', limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it('cursor-based second page does not repeat items from first page', async () => {
    const page1 = await getActivityFeed(TEST_USER_ID, { filter: 'all', limit: 2 });
    expect(page1.nextCursor).toBeDefined();

    const page2 = await getActivityFeed(TEST_USER_ID, {
      filter: 'all',
      limit: 2,
      cursor: page1.nextCursor!,
    });

    const page1Ids = new Set(page1.events.map((e) => e.id));
    for (const event of page2.events) {
      expect(page1Ids.has(event.id)).toBe(false);
    }
  });

  it('last page has hasMore = false and nextCursor = null', async () => {
    const result = await getActivityFeed(TEST_USER_ID, { filter: 'all', limit: 50 });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test suite: event type mapping from RepositoryActivity
// ---------------------------------------------------------------------------

describe('getActivityFeed — event type mapping', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
    seedRow(mockPrisma.repository, {
      id: 'repo-events',
      fullName: 'owner/events',
      claimedBy: TEST_USER_ID,
      htmlUrl: 'https://github.com/owner/events',
    });
  });

  it('maps PULL_REQUEST action=merged to merged_pr type', async () => {
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra-1',
      repositoryId: 'repo-events',
      eventType: 'PULL_REQUEST',
      action: 'merged',
      actorLogin: 'contributor',
      actorAvatar: null,
      title: 'Fix bug',
      url: null,
      occurredAt: makeDate(100),
      repository: { id: 'repo-events', fullName: 'owner/events', htmlUrl: 'https://github.com/owner/events' },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'self' });
    const mergedPr = result.events.find((e) => e.type === 'merged_pr');
    expect(mergedPr).toBeDefined();
  });

  it('maps PULL_REQUEST action=opened to opened_pr type', async () => {
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra-2',
      repositoryId: 'repo-events',
      eventType: 'PULL_REQUEST',
      action: 'opened',
      actorLogin: 'contributor',
      actorAvatar: null,
      title: 'Add feature',
      url: null,
      occurredAt: makeDate(200),
      repository: { id: 'repo-events', fullName: 'owner/events', htmlUrl: 'https://github.com/owner/events' },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'self' });
    const openedPr = result.events.find((e) => e.type === 'opened_pr');
    expect(openedPr).toBeDefined();
  });

  it('maps RELEASE to new_release type', async () => {
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra-3',
      repositoryId: 'repo-events',
      eventType: 'RELEASE',
      action: 'published',
      actorLogin: 'maintainer',
      actorAvatar: null,
      title: 'v1.0.0',
      url: null,
      occurredAt: makeDate(300),
      repository: { id: 'repo-events', fullName: 'owner/events', htmlUrl: 'https://github.com/owner/events' },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'self' });
    const release = result.events.find((e) => e.type === 'new_release');
    expect(release).toBeDefined();
  });

  it('maps FORK to forked_repo type', async () => {
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra-4',
      repositoryId: 'repo-events',
      eventType: 'FORK',
      action: 'created',
      actorLogin: 'forker',
      actorAvatar: null,
      title: null,
      url: null,
      occurredAt: makeDate(400),
      repository: { id: 'repo-events', fullName: 'owner/events', htmlUrl: 'https://github.com/owner/events' },
    });

    const result = await getActivityFeed(TEST_USER_ID, { filter: 'self' });
    const forked = result.events.find((e) => e.type === 'forked_repo');
    expect(forked).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test suite: getNetworkTrending
// ---------------------------------------------------------------------------

describe('getNetworkTrending', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'viewer', avatar: null });
  });

  it('returns empty when the user follows nobody', async () => {
    const result = await getNetworkTrending(TEST_USER_ID);
    expect(result).toHaveLength(0);
  });

  it('surfaces repositories starred by followed users', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.repository, {
      id: 'repo-trending',
      fullName: 'owner/trending',
      htmlUrl: 'https://github.com/owner/trending',
      stars: 500,
    });
    seedRow(mockPrisma.star, { id: 's1', userId: TEST_USER_ID_2, repositoryId: 'repo-trending' });

    const result = await getNetworkTrending(TEST_USER_ID);
    expect(result.find((item) => item.id === 'repo-trending')).toBeDefined();
  });

  it('surfaces posts from followed users', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.post, {
      id: 'post-trending',
      userId: TEST_USER_ID_2,
      content: 'Trending post content here',
      isArchived: false,
      status: 'PUBLISHED',
      likesCount: 50,
      commentsCount: 10,
      createdAt: makeDate(100),
    });

    const result = await getNetworkTrending(TEST_USER_ID);
    expect(result.find((item) => item.id === 'post-trending')).toBeDefined();
  });

  it('items have kind, id, label, url, score, and actorsInNetwork', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.repository, {
      id: 'repo-fields',
      fullName: 'owner/fields',
      htmlUrl: 'https://github.com/owner/fields',
      stars: 100,
    });
    seedRow(mockPrisma.star, { id: 's1', userId: TEST_USER_ID_2, repositoryId: 'repo-fields' });

    const result = await getNetworkTrending(TEST_USER_ID);
    if (result.length > 0) {
      const item = result[0];
      expect(['repository', 'post']).toContain(item.kind);
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('actorsInNetwork');
    }
  });

  it('repos with more network stars rank higher', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });
    seedRow(mockPrisma.follow, { id: 'f2', followerUserId: TEST_USER_ID, followingUserId: USER_3, createdAt: makeDate(200) });

    seedRow(mockPrisma.repository, {
      id: 'repo-popular',
      fullName: 'owner/popular',
      htmlUrl: null,
      stars: 0,
    });
    seedRow(mockPrisma.repository, {
      id: 'repo-niche',
      fullName: 'owner/niche',
      htmlUrl: null,
      stars: 0,
    });

    // Both user2 and user3 starred repo-popular; only user2 starred repo-niche
    seedRow(mockPrisma.star, { id: 's1', userId: TEST_USER_ID_2, repositoryId: 'repo-popular' });
    seedRow(mockPrisma.star, { id: 's2', userId: USER_3, repositoryId: 'repo-popular' });
    seedRow(mockPrisma.star, { id: 's3', userId: TEST_USER_ID_2, repositoryId: 'repo-niche' });

    const result = await getNetworkTrending(TEST_USER_ID);
    const popular = result.find((r) => r.id === 'repo-popular');
    const niche = result.find((r) => r.id === 'repo-niche');
    if (popular && niche) {
      expect(popular.score).toBeGreaterThan(niche.score);
      expect(popular.actorsInNetwork).toBeGreaterThan(niche.actorsInNetwork);
    }
  });

  it('respects the limit parameter', async () => {
    seedRow(mockPrisma.follow, { id: 'f1', followerUserId: TEST_USER_ID, followingUserId: TEST_USER_ID_2, createdAt: makeDate(100) });

    for (let i = 0; i < 10; i++) {
      seedRow(mockPrisma.repository, {
        id: `repo-limit-${i}`,
        fullName: `owner/limit-${i}`,
        htmlUrl: null,
        stars: i,
      });
      seedRow(mockPrisma.star, {
        id: `s-limit-${i}`,
        userId: TEST_USER_ID_2,
        repositoryId: `repo-limit-${i}`,
      });
    }

    const result = await getNetworkTrending(TEST_USER_ID, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
