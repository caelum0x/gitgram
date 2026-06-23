/**
 * ghSocialBridge.ts
 *
 * Bridges gh-social patterns (followingsCache, usernameCache, trimGitHubData)
 * into the Gitgram backend.
 *
 * Provides three public functions:
 *  - fetchGitHubTrending    — trending repos via GitHub Search API
 *  - fetchGitHubSocialFeed  — authenticated user's received events feed
 *  - enrichPostWithGitHubData — detect + enrich owner/repo references in post content
 */

import { Octokit } from '@octokit/rest';
import logger from '../utils/logger';
import { cache } from './redisService';
import {
  getCachedProfile,
  setCachedProfile,
  getCachedRepo,
  setCachedRepo,
} from '../utils/githubProfileCache';
import {
  trimGitHubProfileData,
  trimGitHubRepoData,
  type TrimmedGitHubProfile,
  type TrimmedGitHubRepo,
} from '../utils/githubDataUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || '';

const TTL = {
  TRENDING: 6 * 60 * 60,   // 6 hours — trending data changes slowly
  FEED: 5 * 60,             // 5 minutes — social feed should feel fresh
  FOLLOWING: 10 * 60,       // 10 minutes — following list cache (mirrors gh-social pattern)
  REPO_META: 6 * 60 * 60,   // 6 hours — repo enrichment metadata
};

// ---------------------------------------------------------------------------
// In-memory caches (mirrors gh-social usernameCache / followingsCache pattern)
// ---------------------------------------------------------------------------

interface FollowingsCacheEntry {
  followingLogins: string[];
  lastFetched: Date;
}

/**
 * Per-token in-memory following-list cache.
 * Key: GitHub access token (identifies the authenticated user).
 * Mirrors gh-social's `userNameToFollowingUsernameListsCache` but keyed on
 * the token rather than the Clerk userId (Gitgram backend doesn't use Clerk).
 */
const followingsCache = new Map<string, FollowingsCacheEntry>();

interface UsernameCacheEntry {
  login: string;
  lastFetched: Date;
}

/**
 * Token → GitHub login in-memory cache.
 * Mirrors gh-social's `usernameCache` so every authenticated request does not
 * re-hit the /user endpoint.
 */
const usernameCache = new Map<string, UsernameCacheEntry>();

function secondsElapsed(since: Date): number {
  return (Date.now() - since.getTime()) / 1000;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildOctokit(token?: string): Octokit {
  return new Octokit({ auth: token || GITHUB_TOKEN || undefined });
}

/**
 * Resolve the GitHub login for the owner of `token`.
 * Uses in-memory cache (TTL: 10 min) before hitting /user.
 */
async function getLoginFromToken(token: string): Promise<string> {
  const cached = usernameCache.get(token);
  if (cached && secondsElapsed(cached.lastFetched) < TTL.FOLLOWING) {
    return cached.login;
  }

  const octokit = buildOctokit(token);
  const { data } = await octokit.users.getAuthenticated();
  usernameCache.set(token, { login: data.login, lastFetched: new Date() });
  return data.login;
}

/**
 * Fetch the complete list of GitHub logins that the token-owner follows.
 * Results are cached in memory for TTL.FOLLOWING seconds (mirrors
 * gh-social's `getFollowingUsernameFromGitHubOrCached`).
 */
async function getFollowingLogins(token: string): Promise<string[]> {
  const cached = followingsCache.get(token);
  if (cached && secondsElapsed(cached.lastFetched) < TTL.FOLLOWING) {
    return cached.followingLogins;
  }

  const octokit = buildOctokit(token);
  const login = await getLoginFromToken(token);

  // GitHub returns max 100 per page; paginate exhaustively (mirrors gh-social)
  const { data: profile } = await octokit.users.getByUsername({ username: login });
  const followingCount = profile.following;
  const pagesNeeded = Math.ceil(followingCount / 100) || 1;

  const pages = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) =>
      octokit.users.listFollowingForUser({ username: login, per_page: 100, page: i + 1 })
    )
  );

  const followingLogins = pages.flatMap((p) => p.data.map((u) => u.login));
  followingsCache.set(token, { followingLogins, lastFetched: new Date() });
  return followingLogins;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface TrendingRepo {
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  url: string;
}

export interface GitEventActor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GitEventRepo {
  id: number;
  name: string;     // full_name format: "owner/repo"
  url: string;
}

/** Shaped after gh-social's event objects consumed by the frontend feed. */
export interface GitEvent {
  id: string;
  type: string;
  actor: GitEventActor;
  repo: GitEventRepo;
  /** Raw GitHub event payload — callers narrow by `type`. */
  payload: Record<string, unknown>;
  public: boolean;
  createdAt: string;
}

export interface RepoMeta {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  url: string;
  topics: string[];
  trimmed: TrimmedGitHubRepo;
}

export interface EnrichedPostResult {
  enrichedContent: string;
  repos: RepoMeta[];
}

// ---------------------------------------------------------------------------
// 1. fetchGitHubTrending
// ---------------------------------------------------------------------------

/**
 * Fetch trending repositories from the GitHub Search API.
 *
 * Mirrors gh-social's pattern of using `githubApi` with caching.
 * Uses Redis for cross-process caching (TTL: 6 h) so bursts of requests
 * for the same language/period hit the cache rather than the API.
 *
 * @param language  Optional programming language filter (e.g. "typescript")
 * @param since     Time window — "daily" | "weekly" | "monthly" (default: "daily")
 * @returns         Array of trending repo summaries
 */
export async function fetchGitHubTrending(
  language?: string,
  since: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<TrendingRepo[]> {
  const cacheKey = `gh:trending:${since}:${language ?? 'all'}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as TrendingRepo[];
  }

  // Compute the "created after" date for the search query
  const now = new Date();
  const offset = since === 'daily' ? 1 : since === 'weekly' ? 7 : 30;
  now.setDate(now.getDate() - offset);
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const langFilter = language ? ` language:${language}` : '';
  const query = `created:>${dateStr}${langFilter}`;

  try {
    const octokit = buildOctokit();
    const { data } = await octokit.search.repos({
      q: query,
      sort: 'stars',
      order: 'desc',
      per_page: 25,
    });

    const repos: TrendingRepo[] = data.items.map((item) => ({
      owner: item.owner?.login ?? '',
      name: item.name,
      description: item.description ?? null,
      stars: item.stargazers_count,
      language: item.language ?? null,
      url: item.html_url,
    }));

    await cache.set(cacheKey, repos, TTL.TRENDING);
    return repos;
  } catch (error: unknown) {
    logger.error('[ghSocialBridge] fetchGitHubTrending error', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to fetch trending repositories'
    );
  }
}

// ---------------------------------------------------------------------------
// 2. fetchGitHubSocialFeed
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's GitHub received-events feed.
 *
 * Calls `/users/:login/received_events?per_page=30&page=N` — the same
 * endpoint that gh-social surfaces in its post feed (events from users the
 * authenticated user follows on GitHub).
 *
 * Results are shaped into `GitEvent[]` matching gh-social's usage.
 * Uses Redis caching (TTL: 5 min) per user+page combination.
 *
 * @param githubToken  OAuth access token for the authenticated GitHub user
 * @param page         Page number (1-indexed, default: 1)
 * @returns            Array of GitEvent objects
 */
export async function fetchGitHubSocialFeed(
  githubToken: string,
  page = 1
): Promise<GitEvent[]> {
  const login = await getLoginFromToken(githubToken);
  const cacheKey = `gh:feed:${login}:${page}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as GitEvent[];
  }

  try {
    // Warm the following-list cache so downstream calls are cheap
    await getFollowingLogins(githubToken);

    const octokit = buildOctokit(githubToken);
    const { data } = await octokit.activity.listReceivedEventsForUser({
      username: login,
      per_page: 30,
      page,
    });

    const events: GitEvent[] = data.map((e) => ({
      id: e.id,
      type: e.type ?? 'UnknownEvent',
      actor: {
        login: e.actor.login,
        avatarUrl: e.actor.avatar_url,
        url: `https://github.com/${e.actor.login}`,
      },
      repo: {
        id: e.repo.id,
        name: e.repo.name,
        url: `https://github.com/${e.repo.name}`,
      },
      payload: (e.payload ?? {}) as Record<string, unknown>,
      public: e.public,
      createdAt: e.created_at ?? new Date().toISOString(),
    }));

    await cache.set(cacheKey, events, TTL.FEED);
    return events;
  } catch (error: unknown) {
    logger.error('[ghSocialBridge] fetchGitHubSocialFeed error', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to fetch GitHub social feed'
    );
  }
}

// ---------------------------------------------------------------------------
// 3. enrichPostWithGitHubData
// ---------------------------------------------------------------------------

/**
 * Regex matching bare "owner/repo" references inside post content.
 * Excludes URLs (does not match when preceded by "://") and common
 * path-only segments that start with a slash.
 *
 * Examples matched:
 *   "check out vercel/next.js for more"
 *   "(facebook/react)"
 */
const OWNER_REPO_RE =
  /(?<![:/\w])([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9._-]{1,100})(?![/\w])/g;

/**
 * Fetch repo metadata from cache or GitHub API.
 * Applies trimGitHubRepoData (the gh-social pattern) before returning.
 */
async function fetchRepoMeta(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoMeta | null> {
  const fullName = `${owner}/${repo}`;

  // Check profile cache first (stores TrimmedGitHubRepo)
  const cachedTrimmed = await getCachedRepo(fullName);

  if (cachedTrimmed) {
    return {
      owner: cachedTrimmed.owner.login,
      name: cachedTrimmed.name,
      fullName: cachedTrimmed.full_name,
      description: cachedTrimmed.description,
      stars: cachedTrimmed.stargazers_count,
      forks: cachedTrimmed.forks_count,
      language: null, // TrimmedGitHubRepo doesn't carry language — fetch below if needed
      url: cachedTrimmed.html_url,
      topics: cachedTrimmed.topics,
      trimmed: cachedTrimmed,
    };
  }

  try {
    const octokit = buildOctokit(token);
    const { data } = await octokit.repos.get({ owner, repo });

    // Build a raw GitHubRepo-compatible object for setCachedRepo
    const raw = {
      id: data.id,
      node_id: data.node_id,
      name: data.name,
      full_name: data.full_name,
      html_url: data.html_url,
      description: data.description ?? null,
      fork: data.fork,
      forks_count: data.forks_count,
      stargazers_count: data.stargazers_count,
      watchers_count: data.watchers_count,
      topics: data.topics ?? [],
      owner: {
        id: data.owner.id,
        node_id: data.owner.node_id,
        login: data.owner.login,
        name: null,
        avatar_url: data.owner.avatar_url,
        bio: null,
        blog: null,
        followers: 0,
        following: 0,
        html_url: data.owner.html_url,
        type: data.owner.type,
        company: null,
      },
    };

    const trimmed = await setCachedRepo(raw);

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      description: data.description ?? null,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language ?? null,
      url: data.html_url,
      topics: data.topics ?? [],
      trimmed,
    };
  } catch (error: unknown) {
    // Repo not found or rate-limited — return null and skip enrichment
    logger.warn(`[ghSocialBridge] fetchRepoMeta failed for ${fullName}`, error);
    return null;
  }
}

/**
 * Detect GitHub repo references (owner/repo pattern) in post content and
 * enrich them with live metadata from the GitHub API.
 *
 * The function:
 *  1. Scans `content` for bare owner/repo patterns.
 *  2. Deduplicates matches.
 *  3. Fetches metadata in parallel using the profile cache (setCachedRepo /
 *     getCachedRepo) — mirrors gh-social's trimGitHubData usage.
 *  4. Returns the original content unchanged plus the resolved repo metadata.
 *     (Callers decide how to annotate the content — inline links, cards, etc.)
 *
 * @param content      Raw post content to scan
 * @param githubToken  Optional OAuth token; uses GITHUB_TOKEN env var if absent
 * @returns            { enrichedContent, repos }
 */
export async function enrichPostWithGitHubData(
  content: string,
  githubToken?: string
): Promise<EnrichedPostResult> {
  const matches = new Map<string, { owner: string; name: string }>();

  // Extract all unique owner/repo pairs
  for (const match of content.matchAll(OWNER_REPO_RE)) {
    const owner = match[1];
    const name = match[2];
    // Skip obviously non-repo patterns: pure version numbers, file extensions, etc.
    if (/^\d+\.\d+/.test(name)) continue;
    const key = `${owner}/${name}`.toLowerCase();
    if (!matches.has(key)) {
      matches.set(key, { owner, name });
    }
  }

  if (matches.size === 0) {
    return { enrichedContent: content, repos: [] };
  }

  // Fetch all in parallel — setCachedRepo/getCachedRepo handle dedup
  const settled = await Promise.allSettled(
    Array.from(matches.values()).map(({ owner, name }) =>
      fetchRepoMeta(owner, name, githubToken)
    )
  );

  const repos: RepoMeta[] = settled
    .filter(
      (r): r is PromiseFulfilledResult<RepoMeta> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value);

  // enrichedContent is the original content — downstream layers annotate it
  return { enrichedContent: content, repos };
}
