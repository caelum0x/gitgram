/**
 * Integration tests for /api/v1/social routes
 *
 * The real Express app is created via `createApp()`.
 * `socialGraphService` is mocked at the module level so no database or
 * Redis connections are required.  Authentication is handled by the mock
 * `authenticate` middleware already registered in tests/setup.ts which
 * verifies a real JWT signed with the test secret.
 */

import request from 'supertest';
import { Express } from 'express';
import { generateTestAccessToken } from '../helpers';

// ---------------------------------------------------------------------------
// Mock socialGraphService BEFORE importing the app so the controller picks
// up the mock when its module initialises.
// ---------------------------------------------------------------------------

const mockGetSuggestedUsers = jest.fn();
const mockGetMutualFollowers = jest.fn();
const mockGetFollowSuggestions = jest.fn();
const mockGetActivityFeed = jest.fn();

jest.mock('../../src/services/socialGraphService', () => ({
  __esModule: true,
  socialGraphService: {
    getSuggestedUsers: mockGetSuggestedUsers,
    getMutualFollowers: mockGetMutualFollowers,
    getFollowSuggestions: mockGetFollowSuggestions,
    getActivityFeed: mockGetActivityFeed,
  },
  // Named function exports used by other consumers (unit tests, etc.)
  getSuggestedUsers: mockGetSuggestedUsers,
  getMutualFollowers: mockGetMutualFollowers,
  getFollowSuggestions: mockGetFollowSuggestions,
  getActivityFeed: mockGetActivityFeed,
}));

// ---------------------------------------------------------------------------
// App import — after mocks are registered
// ---------------------------------------------------------------------------

import { createApp } from '../../src/index';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'social-test-user-001';
let app: Express;
let authToken: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  app = createApp();
  authToken = generateTestAccessToken(TEST_USER_ID);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: attach auth header
// ---------------------------------------------------------------------------

function withAuth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${authToken}`);
}

// ===========================================================================
// GET /api/v1/social/suggested-users
// ===========================================================================

describe('GET /api/v1/social/suggested-users', () => {
  const suggestedUsersFixture = [
    {
      id: 'user-aaa',
      username: 'alice',
      avatar: 'https://cdn.test/alice.png',
      bio: 'Open source enthusiast',
      followersCount: 120,
      isVerified: false,
      mutualFollows: 3,
    },
    {
      id: 'user-bbb',
      username: 'bob',
      avatar: null,
      bio: null,
      followersCount: 55,
      isVerified: true,
      mutualFollows: 1,
    },
  ];

  it('returns 200 with an array of suggested users', async () => {
    mockGetSuggestedUsers.mockResolvedValueOnce({
      users: suggestedUsersFixture,
      total: suggestedUsersFixture.length,
    });

    const res = await withAuth(request(app).get('/api/v1/social/suggested-users'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('passes the limit query parameter to the service', async () => {
    mockGetSuggestedUsers.mockResolvedValueOnce({ users: [], total: 0 });

    await withAuth(request(app).get('/api/v1/social/suggested-users?limit=5'));

    expect(mockGetSuggestedUsers).toHaveBeenCalledWith(TEST_USER_ID, 5);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await withAuth(
      request(app).get('/api/v1/social/suggested-users?limit=99'),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is not an integer', async () => {
    const res = await withAuth(
      request(app).get('/api/v1/social/suggested-users?limit=abc'),
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/v1/social/suggested-users');

    expect(res.status).toBe(401);
  });

  it('returns an empty array when the service returns no suggestions', async () => {
    mockGetSuggestedUsers.mockResolvedValueOnce({ users: [], total: 0 });

    const res = await withAuth(request(app).get('/api/v1/social/suggested-users'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/v1/social/mutual-followers/:targetUserId
// ===========================================================================

describe('GET /api/v1/social/mutual-followers/:targetUserId', () => {
  const mutualFollowersFixture = [
    { id: 'user-ccc', username: 'charlie', avatar: null, displayName: 'Charlie' },
    { id: 'user-ddd', username: 'diana', avatar: 'https://cdn.test/diana.png', displayName: null },
  ];

  it('returns 200 with an array of mutual followers', async () => {
    mockGetMutualFollowers.mockResolvedValueOnce({
      users: mutualFollowersFixture,
      count: mutualFollowersFixture.length,
    });

    const res = await withAuth(
      request(app).get('/api/v1/social/mutual-followers/target-user-xyz'),
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  it('calls the service with the authenticated userId and the targetUserId path param', async () => {
    mockGetMutualFollowers.mockResolvedValueOnce({ users: [], count: 0 });

    await withAuth(
      request(app).get('/api/v1/social/mutual-followers/target-user-xyz'),
    );

    expect(mockGetMutualFollowers).toHaveBeenCalledWith(TEST_USER_ID, 'target-user-xyz');
  });

  it('returns 200 with an empty array when there are no mutual followers', async () => {
    mockGetMutualFollowers.mockResolvedValueOnce({ users: [], count: 0 });

    const res = await withAuth(
      request(app).get('/api/v1/social/mutual-followers/no-overlap-user'),
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/v1/social/mutual-followers/any-user');

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/v1/social/follow-suggestions
// ===========================================================================

describe('GET /api/v1/social/follow-suggestions', () => {
  const followSuggestionsFixture = [
    {
      id: 'user-eee',
      username: 'eve',
      avatar: null,
      githubUsername: 'eve-gh',
      displayName: 'Eve',
    },
    {
      id: 'user-fff',
      username: 'frank',
      avatar: 'https://cdn.test/frank.png',
      githubUsername: 'frank-gh',
      displayName: null,
    },
  ];

  it('returns 200 with an array of follow suggestions', async () => {
    mockGetFollowSuggestions.mockResolvedValueOnce({
      suggestions: followSuggestionsFixture,
      source: 'github',
    });

    const res = await withAuth(request(app).get('/api/v1/social/follow-suggestions'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.source).toBe('github');
  });

  it('calls the service with the authenticated userId', async () => {
    mockGetFollowSuggestions.mockResolvedValueOnce({ suggestions: [], source: 'github' });

    await withAuth(request(app).get('/api/v1/social/follow-suggestions'));

    expect(mockGetFollowSuggestions).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('returns an empty array when the user has no GitHub token', async () => {
    mockGetFollowSuggestions.mockResolvedValueOnce({ suggestions: [], source: 'github' });

    const res = await withAuth(request(app).get('/api/v1/social/follow-suggestions'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions).toHaveLength(0);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/v1/social/follow-suggestions');

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/v1/social/activity-feed
// ===========================================================================

describe('GET /api/v1/social/activity-feed', () => {
  const now = new Date();

  const activityEventsFixture = [
    {
      id: 'evt-001',
      type: 'new_post',
      actorId: 'user-ggg',
      actorUsername: 'grace',
      actorAvatar: null,
      targetId: 'post-001',
      targetType: 'post',
      metadata: { content: 'Hello world!' },
      createdAt: now.toISOString(),
    },
    {
      id: 'evt-002',
      type: 'new_follow',
      actorId: 'user-hhh',
      actorUsername: 'henry',
      actorAvatar: 'https://cdn.test/henry.png',
      targetId: 'user-iii',
      targetType: 'user',
      metadata: { targetUsername: 'iris' },
      createdAt: new Date(now.getTime() - 5000).toISOString(),
    },
    {
      id: 'evt-003',
      type: 'repository_star',
      actorId: 'user-jjj',
      actorUsername: 'jack',
      actorAvatar: null,
      targetId: 'repo-001',
      targetType: 'repository',
      metadata: { repositoryFullName: 'jack/awesome-project' },
      createdAt: new Date(now.getTime() - 10000).toISOString(),
    },
  ];

  it('returns 200 with an array of activity events', async () => {
    mockGetActivityFeed.mockResolvedValueOnce({
      events: activityEventsFixture,
      nextCursor: new Date(now.getTime() - 10000).toISOString(),
      hasMore: false,
    });

    const res = await withAuth(request(app).get('/api/v1/social/activity-feed'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events).toHaveLength(3);
  });

  it('passes limit and cursor query parameters to the service', async () => {
    const cursor = new Date(now.getTime() - 60_000).toISOString();
    mockGetActivityFeed.mockResolvedValueOnce({ events: [], nextCursor: undefined, hasMore: false });

    await withAuth(
      request(app).get(`/api/v1/social/activity-feed?limit=10&cursor=${encodeURIComponent(cursor)}`),
    );

    expect(mockGetActivityFeed).toHaveBeenCalledWith(TEST_USER_ID, cursor, 10);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await withAuth(
      request(app).get('/api/v1/social/activity-feed?limit=100'),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when cursor is not a valid ISO date', async () => {
    const res = await withAuth(
      request(app).get('/api/v1/social/activity-feed?cursor=not-a-date'),
    );

    expect(res.status).toBe(400);
  });

  it('returns an empty events array when the user follows nobody', async () => {
    mockGetActivityFeed.mockResolvedValueOnce({ events: [], nextCursor: undefined, hasMore: false });

    const res = await withAuth(request(app).get('/api/v1/social/activity-feed'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
  });

  it('includes a nextCursor in the response when there are more pages', async () => {
    const nextCursor = new Date(now.getTime() - 5000).toISOString();
    mockGetActivityFeed.mockResolvedValueOnce({
      events: activityEventsFixture.slice(0, 2),
      nextCursor,
      hasMore: true,
    });

    const res = await withAuth(request(app).get('/api/v1/social/activity-feed?limit=2'));

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBe(nextCursor);
    expect(res.body.hasMore).toBe(true);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/v1/social/activity-feed');

    expect(res.status).toBe(401);
  });
});
