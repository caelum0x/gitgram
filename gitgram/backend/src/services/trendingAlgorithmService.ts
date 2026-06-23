/**
 * trendingAlgorithmService.ts
 *
 * Sophisticated trending algorithm that combines:
 *  1. Local Gitgram engagement signals (likes, comments, shares, saves, follows)
 *  2. GitHub stars and fork velocity (from gh-social bridge)
 *  3. Time decay factor (fresher content gets a boost)
 *  4. Network effects (content from followed users is boosted 2x)
 */

import prisma from '../utils/prisma';
import { cache } from './redisService';
import logger from '../utils/logger';
import { fetchGitHubTrending, type TrendingRepo } from './ghSocialBridge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_DECAY_CONSTANT = 0.1; // k in e^(-k * hours)
const NETWORK_BOOST_MULTIPLIER = 2;
const TRENDING_WINDOW_HOURS = 72;
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostEngagementContext {
  /** Number of likes on the post. */
  likesCount: number;
  /** Number of comments on the post. */
  commentsCount: number;
  /** Number of shares on the post. */
  sharesCount: number;
  /** Number of saves/bookmarks on the post. */
  savesCount: number;
  /** Whether the post was authored by someone the requesting user follows. */
  isFromFollowing: boolean;
  /** ISO string or Date of when the post was created. */
  createdAt: Date | string;
}

export interface TrendingPostResult {
  postId: string;
  score: number;
  post: {
    id: string;
    userId: string | null;
    content: string | null;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    viewsCount: number;
    createdAt: Date;
    user: {
      id: string;
      username: string | null;
      avatar: string | null;
      verified: boolean;
    } | null;
    repository: {
      id: string;
      fullName: string;
      owner: string | null;
      name: string;
      language: string | null;
    } | null;
  };
}

export interface TrendingRepositoryResult {
  fullName: string;
  score: number;
  source: 'gitgram' | 'github' | 'both';
  repository?: {
    id: string;
    fullName: string;
    owner: string | null;
    name: string;
    language: string | null;
    stars: number;
    forks: number;
    description: string | null;
  };
  githubData?: TrendingRepo;
}

// ---------------------------------------------------------------------------
// Core scoring functions
// ---------------------------------------------------------------------------

/**
 * Compute a trending score for a single post given its engagement signals
 * and the requesting user's context (e.g., whether they follow the author).
 *
 * Formula:
 *   baseScore = likes*2 + comments*3 + shares*2 + saves*1 + (isFromFollowing ? 50 : 0)
 *   trendingScore = baseScore * e^(-TIME_DECAY_CONSTANT * hoursSinceCreated)
 *
 * @param post          Engagement metrics for the post.
 * @param userContext   Context for the requesting user (optional).
 * @returns             Numeric trending score.
 */
export function computeTrendingScore(
  post: PostEngagementContext,
  userContext?: { isFromFollowing?: boolean }
): number {
  const isFromFollowing =
    userContext?.isFromFollowing !== undefined
      ? userContext.isFromFollowing
      : post.isFromFollowing;

  const baseScore =
    post.likesCount * 2 +
    post.commentsCount * 3 +
    post.sharesCount * 2 +
    post.savesCount * 1 +
    (isFromFollowing ? 50 : 0);

  const createdAt =
    post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt);
  const hoursSinceCreated =
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

  const decayedScore = baseScore * Math.exp(-TIME_DECAY_CONSTANT * hoursSinceCreated);
  return decayedScore;
}

// ---------------------------------------------------------------------------
// getTrendingPosts
// ---------------------------------------------------------------------------

/**
 * Return the top trending posts for `userId` within the last 72 hours.
 *
 * Steps:
 *  1. Resolve the set of user IDs that `userId` follows (for network boost).
 *  2. Fetch all non-archived, published posts from the last 72 hours.
 *  3. Score each post with `computeTrendingScore`, applying a 2x multiplier for
 *     posts authored by followed users.
 *  4. Sort descending, apply cursor-based pagination, return `limit` results.
 *
 * @param userId   ID of the requesting user (used for network personalisation).
 * @param limit    Maximum number of posts to return (default: 20).
 * @param cursor   Pagination cursor — the last post ID from the previous page.
 * @returns        Sorted array of posts with their trending scores.
 */
export async function getTrendingPosts(
  userId: string,
  limit = 20,
  cursor?: string
): Promise<TrendingPostResult[]> {
  const windowStart = new Date(
    Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000
  );

  // 1. Resolve the set of followed user IDs (best-effort; defaults to empty set on error)
  let followedUserIds = new Set<string>();
  try {
    const follows = await prisma.follow.findMany({
      where: { followerUserId: userId },
      select: { followingUserId: true },
    });
    followedUserIds = new Set(
      follows
        .map((f) => f.followingUserId)
        .filter((id): id is string => id !== null)
    );
  } catch (err) {
    logger.warn('[trendingAlgorithm] Could not resolve followed users', err);
  }

  // 2. Fetch recent posts
  const posts = await prisma.post.findMany({
    where: {
      createdAt: { gte: windowStart },
      isArchived: false,
      status: 'PUBLISHED',
      ...(cursor
        ? {
            createdAt: { lt: (await prisma.post.findUnique({ where: { id: cursor }, select: { createdAt: true } }))?.createdAt ?? windowStart },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          verified: true,
        },
      },
      repository: {
        select: {
          id: true,
          fullName: true,
          owner: true,
          name: true,
          language: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 10, // Fetch more candidates than needed to allow score-based reordering
  });

  // 3. Score each post
  const scored: TrendingPostResult[] = posts.map((post) => {
    const isFromFollowing =
      post.userId !== null && followedUserIds.has(post.userId);

    const baseScore = computeTrendingScore(
      {
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        sharesCount: post.sharesCount,
        savesCount: 0, // No dedicated savesCount field in schema; extend when available
        isFromFollowing,
        createdAt: post.createdAt,
      }
    );

    // Apply network boost on top of the 50-point bonus already baked into
    // computeTrendingScore so the overall post ranks significantly higher.
    const score = isFromFollowing ? baseScore * NETWORK_BOOST_MULTIPLIER : baseScore;

    return {
      postId: post.id,
      score,
      post: {
        id: post.id,
        userId: post.userId,
        content: post.content,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        sharesCount: post.sharesCount,
        viewsCount: post.viewsCount,
        createdAt: post.createdAt,
        user: post.user,
        repository: post.repository,
      },
    };
  });

  // 4. Sort by score descending and take the requested number
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ---------------------------------------------------------------------------
// getTrendingRepositories
// ---------------------------------------------------------------------------

/**
 * Return trending repositories by merging:
 *  - Gitgram local follower growth (repos gaining followers recently)
 *  - GitHub trending data fetched via `ghSocialBridge.fetchGitHubTrending()`
 *
 * Repositories that appear in both sources receive a combined score.
 *
 * @param limit  Maximum number of results (default: 20).
 * @returns      Sorted array of trending repository results.
 */
export async function getTrendingRepositories(
  limit = 20
): Promise<TrendingRepositoryResult[]> {
  const windowStart = new Date(
    Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000
  );

  // Fetch Gitgram repos with recent follower growth in parallel with GitHub trending
  const [gitgramRepos, githubTrending] = await Promise.allSettled([
    prisma.repository.findMany({
      where: {
        OR: [
          { updatedAt: { gte: windowStart } },
          { followers: { some: { createdAt: { gte: windowStart } } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        owner: true,
        name: true,
        language: true,
        stars: true,
        forks: true,
        description: true,
        _count: {
          select: { followers: true },
        },
      },
      orderBy: { stars: 'desc' },
      take: limit * 3,
    }),
    fetchGitHubTrending(),
  ]);

  // Build a map keyed by fullName (lower-cased) to merge both sources
  const resultMap = new Map<string, TrendingRepositoryResult>();

  // Process Gitgram-local repos
  if (gitgramRepos.status === 'fulfilled') {
    for (const repo of gitgramRepos.value) {
      const key = repo.fullName.toLowerCase();
      // Score: log-weighted stars + follower count (same scale as the post scoring engine)
      const starScore = Math.log10(Math.max(1, repo.stars)) * 10;
      const forkScore = Math.log10(Math.max(1, repo.forks)) * 5;
      const followerScore = repo._count.followers * 2;
      const score = starScore + forkScore + followerScore;

      resultMap.set(key, {
        fullName: repo.fullName,
        score,
        source: 'gitgram',
        repository: {
          id: repo.id,
          fullName: repo.fullName,
          owner: repo.owner,
          name: repo.name,
          language: repo.language,
          stars: repo.stars,
          forks: repo.forks,
          description: repo.description,
        },
      });
    }
  } else {
    logger.warn('[trendingAlgorithm] Failed to fetch Gitgram repos', gitgramRepos.reason);
  }

  // Process GitHub trending repos and merge with Gitgram data
  if (githubTrending.status === 'fulfilled') {
    for (const ghRepo of githubTrending.value) {
      const key = `${ghRepo.owner}/${ghRepo.name}`.toLowerCase();
      const ghScore = Math.log10(Math.max(1, ghRepo.stars)) * 15;

      const existing = resultMap.get(key);
      if (existing) {
        // Merge: repo exists in both sources — combine scores
        resultMap.set(key, {
          ...existing,
          score: existing.score + ghScore,
          source: 'both',
          githubData: ghRepo,
        });
      } else {
        // GitHub-only repo
        resultMap.set(key, {
          fullName: `${ghRepo.owner}/${ghRepo.name}`,
          score: ghScore,
          source: 'github',
          githubData: ghRepo,
        });
      }
    }
  } else {
    logger.warn('[trendingAlgorithm] Failed to fetch GitHub trending', githubTrending.reason);
  }

  // Sort by combined score and return top `limit` results
  const sorted = Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  return sorted.slice(0, limit);
}

// ---------------------------------------------------------------------------
// updateTrendingCache
// ---------------------------------------------------------------------------

/**
 * Refresh the personalised trending-posts Redis cache for `userId`.
 *
 * Cache key:  `trending:posts:{userId}`
 * TTL:        5 minutes
 *
 * The cached value is the array returned by `getTrendingPosts`.
 *
 * @param userId  ID of the user whose cache should be refreshed.
 */
export async function updateTrendingCache(userId: string): Promise<void> {
  const cacheKey = `trending:posts:${userId}`;
  try {
    const posts = await getTrendingPosts(userId);
    await cache.set(cacheKey, posts, CACHE_TTL_SECONDS);
    logger.info(`[trendingAlgorithm] Cache refreshed for user ${userId} (${posts.length} posts)`);
  } catch (err) {
    logger.error(`[trendingAlgorithm] Failed to refresh cache for user ${userId}`, err);
  }
}
