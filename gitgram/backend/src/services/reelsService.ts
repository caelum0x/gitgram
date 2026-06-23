/**
 * ReelsService — business logic for the short-video (Reels) feature.
 *
 * FeedTuner inspiration: gh-social's author-run limiting pattern.
 * MAX_AUTHOR_RUN=2 — no more than 2 consecutive reels from the same creator
 * are allowed in the personalized feed.
 */

import prisma from '../utils/prisma';
import { cache } from './redisService';
import { getFollowingIds } from '../utils/followCache';
import { blockService } from './blockService';
import { createNotification } from './notificationService';
import logger from '../utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AUTHOR_RUN = 2;
const VIEW_RATE_LIMIT_TTL_SECONDS = 60 * 60; // 1 hour

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReelPost {
  id: string;
  userId: string | null;
  accountId: string;
  repositoryId: string | null;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  isArchived: boolean;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
  repository: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
  } | null;
  isLiked?: boolean;
}

export interface CreateReelData {
  videoUrl: string;
  thumbnailUrl: string;
  caption?: string;
  tags?: string[];
  duration: number;
}

export interface ReelsFeedResult {
  reels: ReelPost[];
  nextCursor: string | null;
}

// ─── Shared Prisma include shape ─────────────────────────────────────────────

const reelInclude = {
  user: {
    select: {
      id: true,
      username: true,
      avatar: true,
    },
  },
  repository: {
    select: {
      id: true,
      owner: true,
      name: true,
      fullName: true,
    },
  },
} as const;

// ─── FeedTuner ────────────────────────────────────────────────────────────────

/**
 * Reorders a flat list of reels so that no more than MAX_AUTHOR_RUN consecutive
 * reels come from the same creator.
 *
 * Algorithm (greedy):
 *   Iterate through the source list. For each position, pick the first reel
 *   whose author would not extend the current author-run past MAX_AUTHOR_RUN.
 *   Deferred items are re-inserted as soon as they become valid.
 */
function applyFeedTuner(reels: ReelPost[]): ReelPost[] {
  const result: ReelPost[] = [];
  const pool = [...reels];

  while (pool.length > 0) {
    const lastAuthors = result.slice(-MAX_AUTHOR_RUN).map((r) => r.userId);
    const runIsFull =
      lastAuthors.length === MAX_AUTHOR_RUN &&
      lastAuthors.every((id) => id === lastAuthors[0]);

    if (!runIsFull) {
      // Any reel is fine — take the first one.
      result.push(pool.shift()!);
      continue;
    }

    // Current run is saturated; find first reel from a different author.
    const blockedAuthor = lastAuthors[0];
    const candidateIndex = pool.findIndex((r) => r.userId !== blockedAuthor);

    if (candidateIndex === -1) {
      // All remaining reels are from the same author — append as-is.
      result.push(...pool.splice(0));
      break;
    }

    result.push(...pool.splice(candidateIndex, 1));
  }

  return result;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns a personalized reels feed for the given user.
 *
 * Strategy:
 *   1. Fetch reels from followed users (recency-ordered).
 *   2. Back-fill with trending reels (last 7 days, high engagement) to fill the
 *      page when the following set is sparse.
 *   3. Apply FeedTuner to enforce MAX_AUTHOR_RUN=2.
 *   4. Cursor-based pagination using createdAt encoded as an ISO string.
 */
export async function getReelsFeed(
  userId: string,
  cursor?: string,
  limit: number = 10,
): Promise<ReelsFeedResult> {
  const blockedIds = await blockService.getAllBlockedIds(userId);
  const followingIds = [...(await getFollowingIds(userId)), userId];
  const allowedAuthorIds = followingIds.filter((id) => !blockedIds.includes(id));

  const cursorDate = cursor ? new Date(cursor) : undefined;

  // Fetch from followed users — over-fetch to account for FeedTuner reordering.
  const overFetch = limit * 3;

  const [followedReels, trendingReels] = await Promise.all([
    prisma.reel.findMany({
      where: {
        userId: { in: allowedAuthorIds },
        isArchived: false,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: overFetch,
      include: reelInclude,
    }),
    prisma.reel.findMany({
      where: {
        userId: { notIn: [...allowedAuthorIds, ...blockedIds] },
        isArchived: false,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          ...(cursorDate ? { lt: cursorDate } : {}),
        },
      },
      orderBy: [{ likesCount: 'desc' }, { viewsCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: reelInclude,
    }),
  ]);

  // Merge: followed first, trending back-fill (deduplicate by id).
  const seenIds = new Set<string>();
  const merged: ReelPost[] = [];

  for (const reel of [...followedReels, ...trendingReels]) {
    if (seenIds.has(reel.id)) continue;
    seenIds.add(reel.id);
    merged.push(reel as unknown as ReelPost);
  }

  // Apply FeedTuner author-run cap.
  const tuned = applyFeedTuner(merged);

  // Slice to requested limit + 1 to detect if there is a next page.
  const page = tuned.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const reels = hasMore ? page.slice(0, limit) : page;
  const nextCursor = hasMore ? reels[reels.length - 1].createdAt.toISOString() : null;

  return { reels, nextCursor };
}

/**
 * Creates a new reel post with mediaType='video' and asynchronously notifies
 * the creator's followers.
 */
export async function createReel(
  userId: string,
  data: CreateReelData,
): Promise<ReelPost> {
  // Resolve the account for this user.
  const account = await prisma.account.findFirst({ where: { userId } });
  if (!account) {
    throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  }

  const title = data.caption ?? 'New Reel';

  const reel = await prisma.reel.create({
    data: {
      accountId: account.id,
      userId,
      title,
      description: data.caption ?? null,
      videoUrl: data.videoUrl,
      thumbnailUrl: data.thumbnailUrl,
      duration: data.duration,
    },
    include: reelInclude,
  });

  logger.info(`Reel created: ${reel.id} by user ${userId}`);

  // Async: notify followers — fire and forget, never blocks the response.
  notifyFollowersOfNewReel(userId, reel.id, title).catch((err: unknown) => {
    logger.error('Failed to notify followers of new reel:', err);
  });

  return reel as unknown as ReelPost;
}

/**
 * Returns a single reel with view count and like status for the optional viewer.
 */
export async function getReelById(
  reelId: string,
  viewerId?: string,
): Promise<ReelPost & { isLiked: boolean }> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    include: {
      ...reelInclude,
      _count: {
        select: { likes: true, comments: true, views: true },
      },
    },
  });

  if (!reel) {
    throw Object.assign(new Error('Reel not found'), { statusCode: 404 });
  }

  if (reel.isArchived && reel.userId !== viewerId) {
    throw Object.assign(new Error('Reel not found'), { statusCode: 404 });
  }

  let isLiked = false;

  if (viewerId) {
    const existingLike = await prisma.reelLike
      .findFirst({
        where: { reelId, userId: viewerId },
        select: { id: true },
      })
      .catch(() => null);

    isLiked = Boolean(existingLike);
  }

  const { _count, ...reelData } = reel;

  return {
    ...(reelData as unknown as ReelPost),
    viewsCount: _count.views,
    likesCount: _count.likes,
    commentsCount: _count.comments,
    isLiked,
  };
}

/**
 * Tracks a reel view and increments the counter.
 *
 * Rate limit: at most 1 view per (viewer, reel) pair per hour using Redis.
 * Anonymous views (no viewerId) are always counted.
 */
export async function incrementReelView(
  reelId: string,
  viewerId?: string,
): Promise<{ counted: boolean }> {
  if (viewerId) {
    const rateLimitKey = `reel:view:${viewerId}:${reelId}`;
    const alreadyViewed = await cache.get(rateLimitKey);

    if (alreadyViewed) {
      return { counted: false };
    }

    // Record the rate limit token before writing to DB to minimise double-counts
    // under concurrent requests. TTL = 1 hour.
    await cache.set(rateLimitKey, 1, VIEW_RATE_LIMIT_TTL_SECONDS);

    // Persist the view record (ignore unique-constraint errors for resilience).
    await prisma.reelView
      .create({ data: { reelId, userId: viewerId } })
      .catch(() => undefined);
  }

  await prisma.reel
    .update({
      where: { id: reelId },
      data: { viewsCount: { increment: 1 } },
    })
    .catch((err: unknown) => {
      logger.error(`Failed to increment view count for reel ${reelId}:`, err);
    });

  return { counted: true };
}

/**
 * Returns all non-archived reels from a specific creator, cursor-paginated.
 */
export async function getCreatorReels(
  creatorUserId: string,
  cursor?: string,
): Promise<ReelsFeedResult> {
  const limit = 20;
  const cursorDate = cursor ? new Date(cursor) : undefined;

  const reels = await prisma.reel.findMany({
    where: {
      userId: creatorUserId,
      isArchived: false,
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: reelInclude,
  });

  const hasMore = reels.length > limit;
  const page = hasMore ? reels.slice(0, limit) : reels;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return {
    reels: page as unknown as ReelPost[],
    nextCursor,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Looks up all followers of `userId` and sends each one a notification about
 * the new reel. Runs asynchronously — errors are swallowed after logging.
 */
async function notifyFollowersOfNewReel(
  userId: string,
  reelId: string,
  title: string,
): Promise<void> {
  const followers = await prisma.follow.findMany({
    where: { followingUserId: userId },
    select: { followerUserId: true },
  });

  const creatorUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  const username = creatorUser?.username ?? 'Someone';
  const content = `${username} posted a new reel: ${title}`;

  await Promise.allSettled(
    followers
      .map((f) => f.followerUserId)
      .filter((followerId): followerId is string => Boolean(followerId))
      .map((followerId) =>
        createNotification(followerId, 'REPO_UPDATE', content, userId, reelId),
      ),
  );
}
