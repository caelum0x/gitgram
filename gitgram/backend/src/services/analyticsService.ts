import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ============================================
// Mock Redis (Map-based; swap for redisService when ready)
// ============================================

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const mockRedis = new Map<string, CacheEntry>();
const pendingFlushes = new Map<string, { postId?: string; repoId?: string; delta: number }>();

function redisIncr(key: string, ttlMs: number): number {
  const now = Date.now();
  const entry = mockRedis.get(key);
  if (entry && entry.expiresAt > now) {
    entry.value += 1;
    return entry.value;
  }
  mockRedis.set(key, { value: 1, expiresAt: now + ttlMs });
  return 1;
}

function redisGet(key: string): number {
  const now = Date.now();
  const entry = mockRedis.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  mockRedis.delete(key);
  return 0;
}

// Flush buffered view counts to DB every 5 minutes
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

async function flushViewsToDB(): Promise<void> {
  if (pendingFlushes.size === 0) return;

  const snapshot = new Map(pendingFlushes);
  pendingFlushes.clear();

  for (const [, payload] of snapshot) {
    try {
      if (payload.postId) {
        await prisma.post.update({
          where: { id: payload.postId },
          data: { viewsCount: { increment: payload.delta } },
        });
      }
      if (payload.repoId) {
        // Repository does not have a viewsCount field yet; skip until schema is updated
        logger.warn('analyticsService: repository viewCount flush skipped (field not in schema)', { repoId: payload.repoId });
      }
    } catch (error) {
      logger.error('analyticsService: DB flush error', { error, payload });
    }
  }
}

setInterval(() => {
  flushViewsToDB().catch((err) =>
    logger.error('analyticsService: periodic flush failed', err)
  );
}, FLUSH_INTERVAL_MS);

// ============================================
// Return type interfaces
// ============================================

export interface PostAnalytics {
  postId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  viewsLast7Days: number[];
  likesLast7Days: number[];
}

export interface UserAnalytics {
  userId: string;
  totalPostViews: number;
  totalLikes: number;
  followersGrowth7Days: number[];
  topPosts: TopPost[];
  reach: number;
}

export interface TopPost {
  id: string;
  content: string;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
}

export interface RepoAnalytics {
  repoId: string;
  views: number;
  stars: number;
  forks: number;
  viewsLast7Days: number[];
  starsLast7Days: number[];
  uniqueViewers: number;
}

// ============================================
// Helpers
// ============================================

function buildLast7DaysBuckets(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function sevenDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
}

// ============================================
// Core tracking functions
// ============================================

/**
 * Track a view on a post.
 * Unique views are deduplicated per viewer per post per hour via the mock Redis layer.
 * Counts are buffered and flushed to DB every 5 minutes.
 */
export async function trackPostView(
  postId: string,
  viewerId: string | null
): Promise<void> {
  try {
    const hourKey = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    const dedupeKey = `view:post:${postId}:${viewerId ?? 'anon'}:${hourKey}`;

    const count = redisIncr(dedupeKey, 60 * 60 * 1000); // 1-hour TTL
    if (count > 1) {
      // Already counted this viewer in the current hour window
      return;
    }

    const flushKey = `flush:post:${postId}`;
    const existing = pendingFlushes.get(flushKey);
    if (existing) {
      existing.delta += 1;
    } else {
      pendingFlushes.set(flushKey, { postId, delta: 1 });
    }
  } catch (error) {
    logger.error('analyticsService: trackPostView error', { error, postId });
  }
}

/**
 * Track a view on a repository.
 * Same deduplication and buffering strategy as trackPostView.
 */
export async function trackRepoView(
  repoId: string,
  viewerId: string | null
): Promise<void> {
  try {
    const hourKey = new Date().toISOString().slice(0, 13);
    const dedupeKey = `view:repo:${repoId}:${viewerId ?? 'anon'}:${hourKey}`;

    const count = redisIncr(dedupeKey, 60 * 60 * 1000);
    if (count > 1) {
      return;
    }

    const flushKey = `flush:repo:${repoId}`;
    const existing = pendingFlushes.get(flushKey);
    if (existing) {
      existing.delta += 1;
    } else {
      pendingFlushes.set(flushKey, { repoId, delta: 1 });
    }
  } catch (error) {
    logger.error('analyticsService: trackRepoView error', { error, repoId });
  }
}

// ============================================
// Analytics query functions
// ============================================

/**
 * Return analytics for a specific post.
 * Throws if userId does not own the post.
 */
export async function getPostAnalytics(
  postId: string,
  userId: string
): Promise<PostAnalytics> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      viewsCount: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,
    },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  if (post.userId !== userId) {
    throw new Error('Forbidden: not the post owner');
  }

  const days = buildLast7DaysBuckets();
  const since = sevenDaysAgo();

  // Per-day like counts for the last 7 days
  const likesRaw = await prisma.like.groupBy({
    by: ['createdAt'],
    where: { postId, createdAt: { gte: since } },
    _count: { id: true },
  });

  const likesMap = new Map<string, number>();
  for (const row of likesRaw) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    likesMap.set(day, (likesMap.get(day) ?? 0) + row._count.id);
  }

  // Views last 7 days come from the in-memory Redis layer (best-effort)
  const viewsLast7Days = days.map((day) => {
    const key = `daily:view:post:${postId}:${day}`;
    return redisGet(key);
  });

  const likesLast7Days = days.map((day) => likesMap.get(day) ?? 0);

  return {
    postId,
    views: (post.viewsCount ?? 0),
    likes: post.likesCount ?? 0,
    comments: post.commentsCount ?? 0,
    shares: post.sharesCount ?? 0,
    viewsLast7Days,
    likesLast7Days,
  };
}

/**
 * Return aggregate analytics for a user's profile.
 * Throws if the requestor is not the profile owner.
 */
export async function getUserAnalytics(
  profileUserId: string,
  requestorId: string
): Promise<UserAnalytics> {
  if (profileUserId !== requestorId) {
    throw new Error('Forbidden: can only view your own analytics');
  }

  const since = sevenDaysAgo();
  const days = buildLast7DaysBuckets();

  // Aggregate post-level totals
  const postTotals = await prisma.post.aggregate({
    where: { userId: profileUserId },
    _sum: { viewsCount: true, likesCount: true },
  });

  // Top 5 posts by views
  const topPostsRaw = await prisma.post.findMany({
    where: { userId: profileUserId },
    orderBy: { viewsCount: 'desc' },
    take: 5,
    select: {
      id: true,
      content: true,
      viewsCount: true,
      likesCount: true,
      commentsCount: true,
      createdAt: true,
    },
  });

  const topPosts: TopPost[] = topPostsRaw.map((p) => ({
    id: p.id,
    content: p.content,
    viewsCount: p.viewsCount ?? 0,
    likesCount: p.likesCount ?? 0,
    commentsCount: p.commentsCount ?? 0,
    createdAt: p.createdAt,
  }));

  // New follower counts per day over the last 7 days
  const followersRaw = await prisma.follow.groupBy({
    by: ['createdAt'],
    where: { followingId: profileUserId, createdAt: { gte: since } },
    _count: { id: true },
  });

  const followersMap = new Map<string, number>();
  for (const row of followersRaw) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    followersMap.set(day, (followersMap.get(day) ?? 0) + row._count.id);
  }

  const followersGrowth7Days = days.map((day) => followersMap.get(day) ?? 0);

  // Reach = distinct users who liked or commented in the window
  const [uniqueLikers, uniqueCommenters] = await Promise.all([
    prisma.like.groupBy({
      by: ['userId'],
      where: { post: { userId: profileUserId }, createdAt: { gte: since } },
    }),
    prisma.comment.groupBy({
      by: ['userId'],
      where: { post: { userId: profileUserId }, createdAt: { gte: since } },
    }),
  ]);

  const reachSet = new Set([
    ...uniqueLikers.map((r) => r.userId),
    ...uniqueCommenters.map((r) => r.userId),
  ]);

  return {
    userId: profileUserId,
    totalPostViews: postTotals._sum?.viewsCount ?? 0,
    totalLikes: postTotals._sum?.likesCount ?? 0,
    followersGrowth7Days,
    topPosts,
    reach: reachSet.size,
  };
}

/**
 * Return analytics for a repository.
 * Throws if userId does not own the repository.
 */
export async function getRepositoryAnalytics(
  repoId: string,
  userId: string
): Promise<RepoAnalytics> {
  // NOTE: Repository schema does not yet have userId/viewCount/starCount/forkCount.
  // We use claimedBy as the ownership field and stars/forks from the GitHub data.
  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
    select: {
      id: true,
      claimedBy: true,
      stars: true,
      forks: true,
    },
  });

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== userId) {
    throw new Error('Forbidden: not the repository owner');
  }

  const days = buildLast7DaysBuckets();

  const viewsLast7Days = days.map((day) => {
    const key = `daily:view:repo:${repoId}:${day}`;
    return redisGet(key);
  });

  return {
    repoId,
    views: 0, // viewsCount field not yet in schema
    stars: repo.stars ?? 0,
    forks: repo.forks ?? 0,
    viewsLast7Days,
    starsLast7Days: days.map(() => 0), // star history requires Star model (not yet in schema)
    uniqueViewers: 0, // requires Star model (not yet in schema)
  };
}
