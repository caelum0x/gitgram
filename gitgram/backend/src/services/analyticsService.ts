import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { counters, isRedisReady } from './redisService';

// ============================================
// View counting / dedup backed by Redis.
//
// When Redis is connected (production / multi-instance), dedup and buffered
// view deltas live in Redis so counts survive restarts and dedup is consistent
// across instances. When Redis is NOT connected (local dev / tests) the service
// transparently falls back to a single-instance in-memory implementation.
// ============================================

const DEDUPE_TTL_SECONDS = 60 * 60; // 1 hour
const BUFFER_TTL_SECONDS = 24 * 60 * 60; // daily buckets live a day
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const FLUSH_KEY_PREFIX = 'analytics:flush:';
const DAILY_KEY_PREFIX = 'analytics:daily:';
const DEDUPE_KEY_PREFIX = 'analytics:dedupe:';

// ---- In-memory fallback (single-instance only) ----
interface CacheEntry {
  value: number;
  expiresAt: number;
}

const localCounters = new Map<string, CacheEntry>();

function localIncr(key: string, ttlMs: number): number {
  const now = Date.now();
  const entry = localCounters.get(key);
  if (entry && entry.expiresAt > now) {
    entry.value += 1;
    return entry.value;
  }
  localCounters.set(key, { value: 1, expiresAt: now + ttlMs });
  return 1;
}

function localIncrBy(key: string, amount: number, ttlMs: number): void {
  const now = Date.now();
  const entry = localCounters.get(key);
  if (entry && entry.expiresAt > now) {
    entry.value += amount;
  } else {
    localCounters.set(key, { value: amount, expiresAt: now + ttlMs });
  }
}

function localGet(key: string): number {
  const now = Date.now();
  const entry = localCounters.get(key);
  if (entry && entry.expiresAt > now) return entry.value;
  localCounters.delete(key);
  return 0;
}

function localTakeAndReset(key: string): number {
  const value = localGet(key);
  localCounters.delete(key);
  return value;
}

function localScanFlushKeys(): string[] {
  const now = Date.now();
  const keys: string[] = [];
  for (const [key, entry] of localCounters) {
    if (key.startsWith(FLUSH_KEY_PREFIX) && entry.expiresAt > now) {
      keys.push(key);
    }
  }
  return keys;
}

// ---- Unified counter API (Redis when ready, local otherwise) ----

/** Increment a dedup counter. Returns the post-increment value. */
async function bumpDedupe(key: string): Promise<number> {
  if (isRedisReady()) {
    const value = await counters.incrWithTtl(key, DEDUPE_TTL_SECONDS);
    if (value !== null) return value;
  }
  return localIncr(key, DEDUPE_TTL_SECONDS * 1000);
}

/** Buffer one view for a post/repo (flush + daily bucket counters). */
async function bufferView(scope: 'post' | 'repo', id: string, day: string): Promise<void> {
  const flushKey = `${FLUSH_KEY_PREFIX}${scope}:${id}`;
  const dailyKey = `${DAILY_KEY_PREFIX}view:${scope}:${id}:${day}`;
  if (isRedisReady()) {
    const flushed = await counters.incrByWithTtl(flushKey, 1, BUFFER_TTL_SECONDS);
    const daily = await counters.incrByWithTtl(dailyKey, 1, BUFFER_TTL_SECONDS);
    if (flushed !== null && daily !== null) return;
  }
  localIncrBy(flushKey, 1, BUFFER_TTL_SECONDS * 1000);
  localIncrBy(dailyKey, 1, BUFFER_TTL_SECONDS * 1000);
}

/** Read a buffered daily view counter (best-effort, un-flushed deltas). */
async function readDailyBuffer(scope: 'post' | 'repo', id: string, day: string): Promise<number> {
  const dailyKey = `${DAILY_KEY_PREFIX}view:${scope}:${id}:${day}`;
  if (isRedisReady()) {
    return counters.getInt(dailyKey);
  }
  return localGet(dailyKey);
}

interface FlushTarget {
  scope: 'post' | 'repo';
  id: string;
  key: string;
}

function parseFlushKey(key: string): FlushTarget | null {
  const rest = key.slice(FLUSH_KEY_PREFIX.length); // "<scope>:<id>"
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  const scope = rest.slice(0, sep);
  const id = rest.slice(sep + 1);
  if ((scope !== 'post' && scope !== 'repo') || !id) return null;
  return { scope, id, key };
}

/**
 * Flush buffered view deltas to the database. Each flush key is claimed
 * atomically (GETDEL / local take) so a delta is applied to the DB exactly once
 * even with concurrent flushers across instances.
 */
async function flushViewsToDB(): Promise<void> {
  const flushKeys = isRedisReady()
    ? await counters.scanKeys(`${FLUSH_KEY_PREFIX}*`)
    : localScanFlushKeys();

  for (const key of flushKeys) {
    const target = parseFlushKey(key);
    if (!target) continue;

    const delta = isRedisReady()
      ? await counters.takeAndReset(key)
      : localTakeAndReset(key);
    if (delta <= 0) continue;

    try {
      if (target.scope === 'post') {
        await prisma.post.update({
          where: { id: target.id },
          data: { viewsCount: { increment: delta } },
        });
      } else {
        await prisma.repository.update({
          where: { id: target.id },
          data: { viewsCount: { increment: delta } },
        });
      }
    } catch (error) {
      logger.error('analyticsService: DB flush error', { error, target, delta });
    }
  }
}

const flushTimer = setInterval(() => {
  flushViewsToDB().catch((err) =>
    logger.error('analyticsService: periodic flush failed', err)
  );
}, FLUSH_INTERVAL_MS);
// Do not keep the event loop alive solely for the flush timer (clean test exit).
if (typeof flushTimer.unref === 'function') {
  flushTimer.unref();
}

/** Force an immediate flush of buffered view deltas (used in tests / shutdown). */
export async function flushViewBuffers(): Promise<void> {
  await flushViewsToDB();
}

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
    const now = new Date();
    const hourKey = now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    const day = now.toISOString().slice(0, 10);
    const dedupeKey = `${DEDUPE_KEY_PREFIX}view:post:${postId}:${viewerId ?? 'anon'}:${hourKey}`;

    const count = await bumpDedupe(dedupeKey);
    if (count > 1) {
      // Already counted this viewer in the current hour window
      return;
    }

    await bufferView('post', postId, day);
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
    const now = new Date();
    const hourKey = now.toISOString().slice(0, 13);
    const day = now.toISOString().slice(0, 10);
    const dedupeKey = `${DEDUPE_KEY_PREFIX}view:repo:${repoId}:${viewerId ?? 'anon'}:${hourKey}`;

    const count = await bumpDedupe(dedupeKey);
    if (count > 1) {
      return;
    }

    await bufferView('repo', repoId, day);
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

  // Buffered (un-flushed) per-day views from the Redis counter layer (best-effort).
  const viewsLast7Days = await Promise.all(
    days.map((day) => readDailyBuffer('post', postId, day))
  );

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
  // Ownership is tracked via claimedBy; views/stars/forks read from the repo row.
  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
    select: {
      id: true,
      claimedBy: true,
      stars: true,
      forks: true,
      viewsCount: true,
    },
  });

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== userId) {
    throw new Error('Forbidden: not the repository owner');
  }

  const days = buildLast7DaysBuckets();
  const since = sevenDaysAgo();

  // Live (un-flushed) view counts buffered in Redis, keyed per day.
  const bufferedViewsLast7Days = await Promise.all(
    days.map((day) => readDailyBuffer('repo', repoId, day))
  );

  // Persisted per-path view rows + recent stars, fetched in parallel.
  const [pathViews, recentStars] = await Promise.all([
    prisma.repositoryPathView.findMany({
      where: { repositoryId: repoId, date: { gte: since } },
      select: { views: true, date: true },
    }),
    prisma.star.findMany({
      where: { repositoryId: repoId, createdAt: { gte: since } },
      select: { createdAt: true, userId: true },
    }),
  ]);

  // Persisted views per day-bucket merged with the in-memory buffer.
  const persistedViewsByDay = new Map<string, number>();
  for (const row of pathViews) {
    const key = row.date.toISOString().slice(0, 10);
    persistedViewsByDay.set(key, (persistedViewsByDay.get(key) ?? 0) + row.views);
  }

  const viewsLast7Days = days.map(
    (day, i) => (persistedViewsByDay.get(day) ?? 0) + bufferedViewsLast7Days[i]
  );

  // Stars created per day over the window.
  const starsByDay = new Map<string, number>();
  for (const star of recentStars) {
    const key = star.createdAt.toISOString().slice(0, 10);
    starsByDay.set(key, (starsByDay.get(key) ?? 0) + 1);
  }
  const starsLast7Days = days.map((day) => starsByDay.get(day) ?? 0);

  // Unique viewers approximated from distinct users who starred in the window
  // (the only per-user repository signal currently tracked).
  const uniqueViewers = new Set(recentStars.map((s) => s.userId)).size;

  return {
    repoId,
    views: repo.viewsCount ?? 0,
    stars: repo.stars ?? 0,
    forks: repo.forks ?? 0,
    viewsLast7Days,
    starsLast7Days,
    uniqueViewers,
  };
}
