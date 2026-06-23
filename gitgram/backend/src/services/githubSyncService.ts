/**
 * GitHub Social Sync Service
 *
 * Imports a user's GitHub followers as "suggested follows" and their starred
 * repos as "content suggestions" — adapted from gh-social's approach of
 * mapping GitHub social graph into the app's social feed.
 *
 * Uses the existing Octokit dependency and Redis caching layer.
 */

import { Octokit } from '@octokit/rest';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import redisClient from './redisService';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubFollower {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

interface SuggestedFollow {
  githubUsername: string;
  githubId: number;
  avatarUrl: string;
  profileUrl: string;
  /** The Gitgram user ID if they already have an account, null otherwise */
  gitgramUserId: string | null;
}

interface StarredRepoSuggestion {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  topics: string[];
  htmlUrl: string;
  /** true if the repo is already tracked in Gitgram's repository table */
  isTracked: boolean;
}

interface SyncFollowersResult {
  imported: number;
  alreadyOnPlatform: number;
  suggestions: ReadonlyArray<SuggestedFollow>;
}

interface SyncStarredResult {
  imported: number;
  alreadyTracked: number;
  suggestions: ReadonlyArray<StarredRepoSuggestion>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_TTL_FOLLOWERS = 12 * 60 * 60; // 12 hours
const CACHE_TTL_STARRED = 12 * 60 * 60;   // 12 hours
const MAX_PAGES = 5; // GitHub paginates at 100/page — fetch up to 500 items

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Import a user's GitHub followers and map them to Gitgram accounts.
 *
 * For each GitHub follower we check whether they already have a Gitgram
 * account (matched by `githubUsername` on the User model).  The result
 * distinguishes between "already on platform" and "suggested invite".
 */
export async function syncFollowers(
  userId: string,
  githubToken: string
): Promise<SyncFollowersResult> {
  const cacheKey = `github:sync:followers:${userId}`;

  // Check cache
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SyncFollowersResult;
    }
  } catch {
    // Redis unavailable — proceed without cache
  }

  const octokit = new Octokit({ auth: githubToken });

  // Fetch the authenticated user's login first
  const { data: authedUser } = await octokit.users.getAuthenticated();

  // Paginate through followers (up to MAX_PAGES pages of 100)
  const allFollowers: GitHubFollower[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await octokit.users.listFollowersForAuthenticatedUser({
      per_page: 100,
      page,
    });
    if (data.length === 0) break;
    allFollowers.push(
      ...data.map(f => ({
        login: f.login,
        id: f.id,
        avatar_url: f.avatar_url,
        html_url: f.html_url,
      }))
    );
    if (data.length < 100) break;
  }

  // Match followers against existing Gitgram users
  const followerLogins = allFollowers.map(f => f.login);
  const existingUsers = await prisma.user.findMany({
    where: { githubUsername: { in: followerLogins } },
    select: { id: true, githubUsername: true },
  });

  const existingMap = new Map(
    existingUsers.map(u => [u.githubUsername, u.id])
  );

  const suggestions: SuggestedFollow[] = allFollowers.map(f => ({
    githubUsername: f.login,
    githubId: f.id,
    avatarUrl: f.avatar_url,
    profileUrl: f.html_url,
    gitgramUserId: existingMap.get(f.login) ?? null,
  }));

  const result: SyncFollowersResult = {
    imported: allFollowers.length,
    alreadyOnPlatform: existingUsers.length,
    suggestions,
  };

  // Cache
  try {
    await redisClient.setex(cacheKey, CACHE_TTL_FOLLOWERS, JSON.stringify(result));
  } catch {
    logger.warn('Failed to cache GitHub followers sync result');
  }

  logger.info(
    `GitHub sync: ${authedUser.login} — ${allFollowers.length} followers imported, ${existingUsers.length} already on platform`
  );

  return result;
}

/**
 * Import a user's GitHub starred repos and surface them as content suggestions.
 *
 * For each starred repo we check whether it is already tracked in Gitgram's
 * `repository` table.  The result lets the frontend offer "follow this repo"
 * or "see posts about this repo" actions.
 */
export async function syncStarredRepos(
  userId: string,
  githubToken: string
): Promise<SyncStarredResult> {
  const cacheKey = `github:sync:starred:${userId}`;

  // Check cache
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SyncStarredResult;
    }
  } catch {
    // Redis unavailable — proceed without cache
  }

  const octokit = new Octokit({ auth: githubToken });

  // Paginate through starred repos
  const allStarred: Array<{
    owner: string;
    name: string;
    fullName: string;
    description: string | null;
    stars: number;
    language: string | null;
    topics: string[];
    htmlUrl: string;
  }> = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await octokit.activity.listReposStarredByAuthenticatedUser({
      per_page: 100,
      page,
      headers: { accept: 'application/vnd.github.v3+json' },
    });
    if (data.length === 0) break;
    for (const repo of data) {
      // Starred repos come as full Repository objects (not StarredRepository with starred_at)
      const r = repo as { owner?: { login?: string }; name?: string; full_name?: string; description?: string | null; stargazers_count?: number; language?: string | null; topics?: string[]; html_url?: string };
      allStarred.push({
        owner: r.owner?.login ?? '',
        name: r.name ?? '',
        fullName: r.full_name ?? '',
        description: r.description ?? null,
        stars: r.stargazers_count ?? 0,
        language: r.language ?? null,
        topics: r.topics ?? [],
        htmlUrl: r.html_url ?? '',
      });
    }
    if (data.length < 100) break;
  }

  // Check which repos are already tracked in Gitgram
  const fullNames = allStarred.map(r => r.fullName);
  const trackedRepos = await prisma.repository.findMany({
    where: { fullName: { in: fullNames } },
    select: { fullName: true },
  });
  const trackedSet = new Set(trackedRepos.map(r => r.fullName));

  const suggestions: StarredRepoSuggestion[] = allStarred.map(r => ({
    ...r,
    isTracked: trackedSet.has(r.fullName),
  }));

  const result: SyncStarredResult = {
    imported: allStarred.length,
    alreadyTracked: trackedRepos.length,
    suggestions,
  };

  // Cache
  try {
    await redisClient.setex(cacheKey, CACHE_TTL_STARRED, JSON.stringify(result));
  } catch {
    logger.warn('Failed to cache GitHub starred sync result');
  }

  logger.info(
    `GitHub sync: starred repos — ${allStarred.length} imported, ${trackedRepos.length} already tracked`
  );

  return result;
}

/**
 * Sync GitHub followers → Gitgram social graph.
 *
 * For every GitHub follower who is already on Gitgram, creates a Follow
 * record so the user's Gitgram feed reflects their real GitHub network.
 * Idempotent: existing follows are skipped.
 *
 * Ported from gh-social's follow/unfollow action pattern (MIT).
 */
export async function syncAndAutoFollow(
  userId: string,
  githubToken: string
): Promise<{ newFollows: number; alreadyFollowing: number; inviteNeeded: number }> {
  const { suggestions } = await syncFollowers(userId, githubToken);

  // Only care about followers who have a Gitgram account
  const onPlatform = suggestions.filter(s => s.gitgramUserId !== null);

  if (onPlatform.length === 0) {
    return { newFollows: 0, alreadyFollowing: 0, inviteNeeded: suggestions.length };
  }

  const targetIds = onPlatform.map(s => s.gitgramUserId as string);

  // Find which ones the user already follows
  const existing = await prisma.follow.findMany({
    where: { followerId: userId, followingId: { in: targetIds } },
    select: { followingId: true },
  });
  const alreadyFollowingSet = new Set(existing.map(f => f.followingId));

  const toCreate = targetIds.filter(id => !alreadyFollowingSet.has(id) && id !== userId);

  if (toCreate.length > 0) {
    await prisma.follow.createMany({
      data: toCreate.map(followingId => ({ followerId: userId, followingId })),
      skipDuplicates: true,
    });

    logger.info(`GitHub social sync: auto-followed ${toCreate.length} Gitgram users for ${userId}`);
  }

  return {
    newFollows: toCreate.length,
    alreadyFollowing: alreadyFollowingSet.size,
    inviteNeeded: suggestions.length - onPlatform.length,
  };
}

/**
 * Wire starred repos into Gitgram's repository follower table.
 *
 * For every starred repo that is already tracked in Gitgram, creates a
 * RepositoryFollower record so the user's feed surfaces its activity.
 */
export async function syncStarredAsFollows(
  userId: string,
  githubToken: string
): Promise<{ newFollows: number; alreadyFollowing: number }> {
  const { suggestions } = await syncStarredRepos(userId, githubToken);

  const trackedRepoNames = suggestions
    .filter(r => r.isTracked)
    .map(r => r.fullName);

  if (trackedRepoNames.length === 0) {
    return { newFollows: 0, alreadyFollowing: 0 };
  }

  const repos = await prisma.repository.findMany({
    where: { fullName: { in: trackedRepoNames } },
    select: { id: true },
  });

  const repoIds = repos.map(r => r.id);

  const existing = await prisma.repositoryFollow.findMany({
    where: { userId, repositoryId: { in: repoIds } },
    select: { repositoryId: true },
  });
  const alreadySet = new Set(existing.map((f: { repositoryId: string }) => f.repositoryId));

  const toCreate = repoIds.filter(id => !alreadySet.has(id));

  if (toCreate.length > 0) {
    await prisma.repositoryFollow.createMany({
      data: toCreate.map(repositoryId => ({ userId, repositoryId })),
      skipDuplicates: true,
    });

    logger.info(`GitHub social sync: auto-followed ${toCreate.length} repos for ${userId}`);
  }

  return { newFollows: toCreate.length, alreadyFollowing: alreadySet.size };
}
