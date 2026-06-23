/**
 * Unit tests for ghSocialBridge.ts
 *
 * Covers:
 *  - fetchGitHubTrending   — cache hit/miss, language filter, error propagation
 *  - fetchGitHubSocialFeed — cache hit/miss, pagination, error propagation
 *  - enrichPostWithGitHubData — URL extraction regex, repo enrichment, error resilience
 *
 * Strategy: all Octokit constructor calls return the same `mockOctokitInstance`
 * object so every method is centrally observable and re-configurable per test.
 * Redis cache is mocked at module level and controlled via `mockedCache.*`.
 */

// ---------------------------------------------------------------------------
// Module-level mocks  (must be declared before any imports that use them)
// ---------------------------------------------------------------------------

// Stable shared Octokit instance returned by every `new Octokit()` call.
const mockSearchRepos = jest.fn();
const mockGetRepo = jest.fn();
const mockGetAuthenticated = jest.fn();
const mockGetByUsername = jest.fn();
const mockListFollowingForUser = jest.fn();
const mockListReceivedEventsForUser = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    search: { repos: mockSearchRepos },
    repos: { get: mockGetRepo },
    users: {
      getAuthenticated: mockGetAuthenticated,
      getByUsername: mockGetByUsername,
      listFollowingForUser: mockListFollowingForUser,
    },
    activity: { listReceivedEventsForUser: mockListReceivedEventsForUser },
  })),
}));

jest.mock('../../src/services/redisService', () => ({
  __esModule: true,
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
  connectRedis: jest.fn(),
  redisClient: {},
}));

jest.mock('../../src/utils/githubProfileCache', () => ({
  getCachedProfile: jest.fn().mockResolvedValue(null),
  setCachedProfile: jest.fn(),
  getCachedRepo: jest.fn().mockResolvedValue(null),
  setCachedRepo: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mock declarations)
// ---------------------------------------------------------------------------

import {
  fetchGitHubTrending,
  fetchGitHubSocialFeed,
  enrichPostWithGitHubData,
} from '../../src/services/ghSocialBridge';
import { cache } from '../../src/services/redisService';
import { getCachedRepo, setCachedRepo } from '../../src/utils/githubProfileCache';

// ---------------------------------------------------------------------------
// Typed aliases for mocked functions
// ---------------------------------------------------------------------------

const mockedCacheGet = cache.get as jest.MockedFunction<typeof cache.get>;
const mockedCacheSet = cache.set as jest.MockedFunction<typeof cache.set>;
const mockedGetCachedRepo = getCachedRepo as jest.MockedFunction<typeof getCachedRepo>;
const mockedSetCachedRepo = setCachedRepo as jest.MockedFunction<typeof setCachedRepo>;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function buildRawRepoData(owner = 'facebook', name = 'react') {
  return {
    id: 1,
    node_id: 'R_abc',
    name,
    full_name: `${owner}/${name}`,
    description: 'A declarative UI library',
    stargazers_count: 220000,
    forks_count: 45000,
    watchers_count: 220000,
    open_issues_count: 1200,
    language: 'JavaScript',
    topics: ['react', 'ui'],
    html_url: `https://github.com/${owner}/${name}`,
    fork: false,
    owner: {
      id: 69631,
      node_id: 'MDEyOk9yZ2FuaXphdGlvbjY5NjMx',
      login: owner,
      name: null,
      avatar_url: `https://avatars.githubusercontent.com/${owner}`,
      bio: null,
      blog: null,
      followers: 0,
      following: 0,
      html_url: `https://github.com/${owner}`,
      type: 'Organization',
      company: null,
    },
  };
}

function buildTrimmedRepo(owner = 'facebook', name = 'react') {
  return {
    id: 1,
    node_id: 'R_abc',
    name,
    full_name: `${owner}/${name}`,
    html_url: `https://github.com/${owner}/${name}`,
    description: 'A declarative UI library',
    fork: false,
    forks_count: 45000,
    stargazers_count: 220000,
    watchers_count: 220000,
    topics: ['react', 'ui'],
    owner: {
      id: 69631,
      node_id: 'MDEyOk9yZ2FuaXphdGlvbjY5NjMx',
      login: owner,
      name: null,
      avatar_url: `https://avatars.githubusercontent.com/${owner}`,
      bio: null,
      blog: null,
      followers: 0,
      following: 0,
      html_url: `https://github.com/${owner}`,
      type: 'Organization',
      company: null,
    },
  };
}

function buildSearchResult(count = 3) {
  return {
    data: {
      items: Array.from({ length: count }, (_, i) => buildRawRepoData(`owner${i}`, `repo${i}`)),
    },
  };
}

function buildGitEvent(index = 0) {
  return {
    id: `evt_${index}`,
    type: 'PushEvent',
    actor: {
      login: `user${index}`,
      avatar_url: `https://avatars.test/user${index}.png`,
    },
    repo: {
      id: index + 100,
      name: `owner${index}/repo${index}`,
    },
    payload: { commits: [] },
    public: true,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Default mock implementations (reset in beforeEach)
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockedCacheGet.mockResolvedValue(null);
  mockedCacheSet.mockResolvedValue(undefined);
  mockedGetCachedRepo.mockResolvedValue(null);
  mockedSetCachedRepo.mockResolvedValue(buildTrimmedRepo() as any);

  mockSearchRepos.mockResolvedValue(buildSearchResult());
  mockGetRepo.mockResolvedValue({ data: buildRawRepoData() });
  mockGetAuthenticated.mockResolvedValue({ data: { login: 'testuser' } });
  mockGetByUsername.mockResolvedValue({ data: { id: 1, login: 'testuser', following: 0 } });
  mockListFollowingForUser.mockResolvedValue({ data: [] });
  mockListReceivedEventsForUser.mockResolvedValue({
    data: [buildGitEvent(0), buildGitEvent(1), buildGitEvent(2)],
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('ghSocialBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // fetchGitHubTrending
  // =========================================================================

  describe('fetchGitHubTrending', () => {
    it('returns an array of TrendingRepo objects on success', async () => {
      const result = await fetchGitHubTrending();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('each returned item has the expected TrendingRepo shape', async () => {
      const result = await fetchGitHubTrending();

      for (const repo of result) {
        expect(repo).toHaveProperty('owner');
        expect(repo).toHaveProperty('name');
        expect(repo).toHaveProperty('description');
        expect(repo).toHaveProperty('stars');
        expect(repo).toHaveProperty('language');
        expect(repo).toHaveProperty('url');
        expect(typeof repo.stars).toBe('number');
        expect(typeof repo.url).toBe('string');
      }
    });

    it('passes the language filter to the GitHub search query', async () => {
      await fetchGitHubTrending('typescript', 'weekly');

      expect(mockSearchRepos).toHaveBeenCalledTimes(1);
      const callArgs = mockSearchRepos.mock.calls[0][0] as { q: string };
      expect(callArgs.q).toMatch(/language:typescript/);
    });

    it('does not append a language filter when language is omitted', async () => {
      await fetchGitHubTrending(undefined, 'daily');

      const callArgs = mockSearchRepos.mock.calls[0][0] as { q: string };
      expect(callArgs.q).not.toMatch(/language:/);
    });

    it('respects the since=daily parameter — query contains YYYY-MM-DD date', async () => {
      await fetchGitHubTrending(undefined, 'daily');

      const callArgs = mockSearchRepos.mock.calls[0][0] as { q: string };
      expect(callArgs.q).toMatch(/created:>\d{4}-\d{2}-\d{2}/);
    });

    it('respects the since=monthly parameter', async () => {
      await fetchGitHubTrending(undefined, 'monthly');

      const callArgs = mockSearchRepos.mock.calls[0][0] as { q: string };
      expect(callArgs.q).toMatch(/created:>/);
    });

    it('returns cached data and skips the Octokit search call on cache hit', async () => {
      const cachedRepos = [
        {
          owner: 'cached-owner',
          name: 'cached-repo',
          description: null,
          stars: 99,
          language: null,
          url: 'https://github.com/cached-owner/cached-repo',
        },
      ];
      mockedCacheGet.mockResolvedValue(cachedRepos);

      const result = await fetchGitHubTrending('rust');

      expect(result).toEqual(cachedRepos);
      expect(mockSearchRepos).not.toHaveBeenCalled();
    });

    it('stores results in Redis cache after a successful API call', async () => {
      await fetchGitHubTrending();

      expect(mockedCacheSet).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mockedCacheSet.mock.calls[0] as [string, unknown, number];
      expect(key).toMatch(/^gh:trending:/);
      expect(Array.isArray(value)).toBe(true);
      expect(ttl).toBeGreaterThan(0);
    });

    it('uses the correct cache key format including language', async () => {
      await fetchGitHubTrending('go', 'weekly');

      const [key] = mockedCacheSet.mock.calls[0] as [string, unknown, number];
      expect(key).toBe('gh:trending:weekly:go');
    });

    it('uses "all" in the cache key when no language is provided', async () => {
      await fetchGitHubTrending(undefined, 'daily');

      const [key] = mockedCacheSet.mock.calls[0] as [string, unknown, number];
      expect(key).toBe('gh:trending:daily:all');
    });

    it('requests per_page=25 from the GitHub Search API', async () => {
      await fetchGitHubTrending();

      const callArgs = mockSearchRepos.mock.calls[0][0] as { per_page: number };
      expect(callArgs.per_page).toBe(25);
    });

    it('sorts by stars descending', async () => {
      await fetchGitHubTrending();

      const callArgs = mockSearchRepos.mock.calls[0][0] as { sort: string; order: string };
      expect(callArgs.sort).toBe('stars');
      expect(callArgs.order).toBe('desc');
    });

    it('propagates errors thrown by Octokit as a new Error', async () => {
      mockSearchRepos.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      await expect(fetchGitHubTrending()).rejects.toThrow('API rate limit exceeded');
    });

    it('wraps non-Error thrown values in a generic error message', async () => {
      mockSearchRepos.mockRejectedValueOnce('string error');

      await expect(fetchGitHubTrending()).rejects.toThrow('Failed to fetch trending repositories');
    });

    it('handles repos with null owner gracefully (falls back to empty string)', async () => {
      mockSearchRepos.mockResolvedValueOnce({
        data: {
          items: [{ ...buildRawRepoData(), owner: null }],
        },
      });

      const result = await fetchGitHubTrending();

      expect(result[0].owner).toBe('');
    });

    it('maps description null correctly', async () => {
      mockSearchRepos.mockResolvedValueOnce({
        data: {
          items: [{ ...buildRawRepoData(), description: null }],
        },
      });

      const result = await fetchGitHubTrending();

      expect(result[0].description).toBeNull();
    });
  });

  // =========================================================================
  // fetchGitHubSocialFeed
  // =========================================================================

  describe('fetchGitHubSocialFeed', () => {
    const TEST_TOKEN = 'ghp_test_token_abc';

    it('returns an array of GitEvent objects', async () => {
      const result = await fetchGitHubSocialFeed(TEST_TOKEN);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('each event has the expected GitEvent shape', async () => {
      const result = await fetchGitHubSocialFeed(TEST_TOKEN);

      for (const event of result) {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('actor');
        expect(event).toHaveProperty('repo');
        expect(event).toHaveProperty('payload');
        expect(event).toHaveProperty('public');
        expect(event).toHaveProperty('createdAt');
        expect(event.actor).toHaveProperty('login');
        expect(event.actor).toHaveProperty('avatarUrl');
        expect(event.actor).toHaveProperty('url');
        expect(event.repo).toHaveProperty('id');
        expect(event.repo).toHaveProperty('name');
        expect(event.repo).toHaveProperty('url');
      }
    });

    it('builds the actor URL from the login', async () => {
      const result = await fetchGitHubSocialFeed(TEST_TOKEN);

      expect(result[0].actor.url).toBe('https://github.com/user0');
    });

    it('builds the repo URL from the full_name', async () => {
      const result = await fetchGitHubSocialFeed(TEST_TOKEN);

      expect(result[0].repo.url).toBe('https://github.com/owner0/repo0');
    });

    it('passes page=1 by default to the GitHub received-events API', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN);

      expect(mockListReceivedEventsForUser).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });

    it('passes the supplied page number to the GitHub API', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN, 3);

      expect(mockListReceivedEventsForUser).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 })
      );
    });

    it('requests per_page=30 from the received events endpoint', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN, 1);

      expect(mockListReceivedEventsForUser).toHaveBeenCalledWith(
        expect.objectContaining({ per_page: 30 })
      );
    });

    it('passes the authenticated login as the username', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN, 1);

      expect(mockListReceivedEventsForUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'testuser' })
      );
    });

    it('returns cached data and skips the Octokit API call on feed cache hit', async () => {
      // The in-memory usernameCache may already hold TEST_TOKEN -> 'testuser'
      // from prior tests. Whether or not it does, cache.get is called exactly
      // once: for the feed key "gh:feed:testuser:2". Return cached events there.
      const cachedEvents = [
        {
          id: 'cached_1',
          type: 'WatchEvent',
          actor: { login: 'a', avatarUrl: '', url: '' },
          repo: { id: 1, name: 'a/b', url: '' },
          payload: {},
          public: true,
          createdAt: new Date().toISOString(),
        },
      ];
      mockedCacheGet.mockResolvedValue(cachedEvents);

      const result = await fetchGitHubSocialFeed(TEST_TOKEN, 2);

      expect(result).toEqual(cachedEvents);
      expect(mockListReceivedEventsForUser).not.toHaveBeenCalled();
    });

    it('stores events in Redis under the correct key after a cache miss', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN, 1);

      const feedSetCall = mockedCacheSet.mock.calls.find(
        ([key]) => (key as string).startsWith('gh:feed:')
      );
      expect(feedSetCall).toBeDefined();
      const [key, value, ttl] = feedSetCall as [string, unknown, number];
      expect(key).toBe('gh:feed:testuser:1');
      expect(Array.isArray(value)).toBe(true);
      expect(ttl).toBeGreaterThan(0);
    });

    it('includes the page number in the feed cache key', async () => {
      await fetchGitHubSocialFeed(TEST_TOKEN, 5);

      const feedSetCall = mockedCacheSet.mock.calls.find(
        ([key]) => (key as string).startsWith('gh:feed:')
      );
      expect(feedSetCall).toBeDefined();
      const [feedKey] = feedSetCall as [string, unknown, number];
      expect(feedKey).toBe('gh:feed:testuser:5');
    });

    it('defaults type to "UnknownEvent" when GitHub event type is null', async () => {
      mockListReceivedEventsForUser.mockResolvedValueOnce({
        data: [{ ...buildGitEvent(0), type: null }],
      });

      const result = await fetchGitHubSocialFeed(TEST_TOKEN, 1);

      expect(result[0].type).toBe('UnknownEvent');
    });

    it('defaults createdAt to a valid ISO string when GitHub returns null', async () => {
      mockListReceivedEventsForUser.mockResolvedValueOnce({
        data: [{ ...buildGitEvent(0), created_at: null }],
      });

      const result = await fetchGitHubSocialFeed(TEST_TOKEN, 1);

      expect(typeof result[0].createdAt).toBe('string');
      expect(result[0].createdAt.length).toBeGreaterThan(0);
    });

    it('propagates errors thrown by listReceivedEventsForUser', async () => {
      mockListReceivedEventsForUser.mockRejectedValueOnce(new Error('403 Forbidden'));

      await expect(fetchGitHubSocialFeed(TEST_TOKEN)).rejects.toThrow('403 Forbidden');
    });

    it('wraps non-Error thrown values in a generic message', async () => {
      mockListReceivedEventsForUser.mockRejectedValueOnce(42);

      await expect(fetchGitHubSocialFeed(TEST_TOKEN)).rejects.toThrow(
        'Failed to fetch GitHub social feed'
      );
    });

    it('propagates errors thrown by getAuthenticated', async () => {
      // Use a token that is NOT in the in-memory usernameCache so that
      // getLoginFromToken actually calls getAuthenticated (and hits our mock).
      const freshToken = `ghp_fresh_token_${Date.now()}`;
      mockGetAuthenticated.mockRejectedValueOnce(new Error('Bad credentials'));

      // getLoginFromToken is called before the try/catch in fetchGitHubSocialFeed
      // so the error propagates out of the function.
      await expect(fetchGitHubSocialFeed(freshToken)).rejects.toThrow('Bad credentials');
    });
  });

  // =========================================================================
  // enrichPostWithGitHubData
  // =========================================================================

  describe('enrichPostWithGitHubData', () => {
    it('returns enrichedContent equal to the original content', async () => {
      mockedSetCachedRepo.mockResolvedValue(buildTrimmedRepo() as any);
      const content = 'Check out facebook/react for UI work';

      const { enrichedContent } = await enrichPostWithGitHubData(content);

      expect(enrichedContent).toBe(content);
    });

    it('returns an empty repos array when no owner/repo patterns are present', async () => {
      const { repos } = await enrichPostWithGitHubData('No GitHub references here.');

      expect(repos).toEqual([]);
      expect(mockGetRepo).not.toHaveBeenCalled();
    });

    it('detects a bare owner/repo reference', async () => {
      const { repos } = await enrichPostWithGitHubData('Check out facebook/react today!');

      expect(repos.length).toBe(1);
      expect(repos[0].fullName).toBe('facebook/react');
    });

    it('detects multiple distinct owner/repo references', async () => {
      mockGetRepo.mockImplementation(({ owner, repo }: { owner: string; repo: string }) =>
        Promise.resolve({ data: buildRawRepoData(owner, repo) })
      );
      mockedSetCachedRepo.mockImplementation(async (raw: any) =>
        buildTrimmedRepo(raw.owner.login, raw.name) as any
      );

      const content = 'Love facebook/react and microsoft/vscode!';
      const { repos } = await enrichPostWithGitHubData(content);

      expect(repos.length).toBe(2);
      const fullNames = repos.map((r) => r.fullName);
      expect(fullNames).toContain('facebook/react');
      expect(fullNames).toContain('microsoft/vscode');
    });

    it('deduplicates the same owner/repo when mentioned more than once', async () => {
      const content = 'facebook/react is great. I use facebook/react every day.';
      const { repos } = await enrichPostWithGitHubData(content);

      expect(repos.length).toBe(1);
    });

    it('skips patterns that look like version numbers (e.g. node/14.17.0)', async () => {
      const { repos } = await enrichPostWithGitHubData('Using node/14.17.0 as runtime.');

      expect(repos.length).toBe(0);
    });

    it('does not include the github.com host segment as a repo fullName', async () => {
      mockGetRepo.mockImplementation(({ owner, repo }: { owner: string; repo: string }) =>
        Promise.resolve({ data: buildRawRepoData(owner, repo) })
      );
      mockedSetCachedRepo.mockImplementation(async (raw: any) =>
        buildTrimmedRepo(raw.owner.login, raw.name) as any
      );

      const { repos } = await enrichPostWithGitHubData(
        'See https://github.com/facebook/react for more'
      );

      for (const repo of repos) {
        expect(repo.fullName).not.toMatch(/github\.com/);
      }
    });

    it('uses cached repo metadata when getCachedRepo returns a hit', async () => {
      const trimmed = buildTrimmedRepo('facebook', 'react');
      mockedGetCachedRepo.mockResolvedValue(trimmed as any);

      const { repos } = await enrichPostWithGitHubData('facebook/react is awesome');

      expect(repos.length).toBe(1);
      // The API must not be called because the cache had the data
      expect(mockGetRepo).not.toHaveBeenCalled();
    });

    it('fetches from API when cache misses and returns correct RepoMeta', async () => {
      const rawRepo = {
        ...buildRawRepoData('facebook', 'react'),
        description: 'A UI library',
        stargazers_count: 200000,
        forks_count: 40000,
        language: 'JavaScript',
        html_url: 'https://github.com/facebook/react',
        topics: ['ui', 'frontend'],
      };
      mockGetRepo.mockResolvedValueOnce({ data: rawRepo });
      mockedSetCachedRepo.mockResolvedValueOnce(buildTrimmedRepo('facebook', 'react') as any);

      const { repos } = await enrichPostWithGitHubData('facebook/react is great');

      expect(repos.length).toBe(1);
      expect(repos[0]).toMatchObject({
        owner: 'facebook',
        name: 'react',
        fullName: 'facebook/react',
        description: 'A UI library',
        stars: 200000,
        forks: 40000,
        language: 'JavaScript',
        url: 'https://github.com/facebook/react',
      });
      expect(repos[0]).toHaveProperty('trimmed');
    });

    it('excludes a repo from results when the API returns a 404', async () => {
      mockGetRepo.mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), { status: 404 })
      );

      const { repos } = await enrichPostWithGitHubData('nobody/fakerepo is mentioned');

      expect(repos).toEqual([]);
    });

    it('continues enriching remaining repos when one API call fails', async () => {
      let callCount = 0;
      mockGetRepo.mockImplementation(({ owner, repo }: { owner: string; repo: string }) => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }));
        }
        return Promise.resolve({ data: buildRawRepoData(owner, repo) });
      });
      mockedSetCachedRepo.mockImplementation(async (raw: any) =>
        buildTrimmedRepo(raw.owner.login, raw.name) as any
      );

      const content = 'nobody/fakerepo and microsoft/vscode';
      const { repos } = await enrichPostWithGitHubData(content);

      // Only the successful fetch should appear
      expect(repos.length).toBe(1);
    });

    it('passes githubToken to the Octokit constructor when provided', async () => {
      const token = 'ghp_secret_token_xyz';
      const { Octokit: MockOctokit } = jest.requireMock('@octokit/rest') as {
        Octokit: jest.MockedClass<any>;
      };

      await enrichPostWithGitHubData('facebook/react post', token);

      const tokenCall = (MockOctokit.mock.calls as [{ auth?: string }][]).find(
        ([opts]) => opts?.auth === token
      );
      expect(tokenCall).toBeDefined();
    });

    it('returns both enrichedContent and repos properties', async () => {
      const result = await enrichPostWithGitHubData('Check facebook/react');

      expect(result).toHaveProperty('enrichedContent');
      expect(result).toHaveProperty('repos');
    });

    it('returns empty repos when content is an empty string', async () => {
      const { repos, enrichedContent } = await enrichPostWithGitHubData('');

      expect(repos).toEqual([]);
      expect(enrichedContent).toBe('');
    });
  });
});
