/**
 * trendingRecomputeService.ts
 *
 * Background job service that periodically recomputes trending scores for the
 * five surfaceable entity types on Gitgram:
 *
 *   1. Posts        — engagement (likes, comments, shares) with recency decay
 *   2. Repositories — stars/forks gained in the window + recent local activity
 *   3. Developers   — followers gained + aggregate post engagement
 *   4. Hashtags     — usage counts over the last 24h / 7d
 *   5. Snippets     — likes + views with recency decay
 *
 * Scoring blends a Wilson lower-bound confidence interval (so low-volume items
 * are not over-ranked by a single lucky interaction) with an exponential
 * time-decay factor (so fresh content surfaces over stale-but-popular content).
 *
 * Results are cached under stable keys (`trending:posts`, `trending:repos`,
 * `trending:developers`, `trending:hashtags`, `trending:snippets`). The shared
 * `cache` helper transparently falls back to a no-op (returning `null`) when
 * Redis is unavailable, so an in-memory snapshot is always retained here as a
 * last-resort fallback for read paths within the same process.
 */

import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { cache } from './redisService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Decay constant `k` used in `e^(-k * hoursSinceCreated)`. */
const TIME_DECAY_CONSTANT = 0.05;

/** z-score for a 95% confidence Wilson interval. */
const WILSON_Z = 1.96;

/** Default rolling window (hours) used when scoring time-sensitive entities. */
const TRENDING_WINDOW_HOURS = 72;

/** Window (hours) for the "recent" hashtag bucket. */
const HASHTAG_RECENT_WINDOW_HOURS = 24;

/** Window (hours) for the "extended" hashtag bucket. */
const HASHTAG_EXTENDED_WINDOW_HOURS = 24 * 7;

/** How long cached trending lists remain valid (seconds). */
const CACHE_TTL_SECONDS = 20 * 60;

/** Maximum number of ranked entries persisted per entity type. */
const MAX_RANKED_ENTRIES = 100;

/** Default scheduler interval (15 minutes). */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/** Candidate fetch ceiling so scoring can reorder beyond the final cut. */
const CANDIDATE_LIMIT = MAX_RANKED_ENTRIES * 5;

/** Stable Redis keys for each trending surface. */
export const TRENDING_CACHE_KEYS = {
  posts: 'trending:posts',
  repos: 'trending:repos',
  developers: 'trending:developers',
  hashtags: 'trending:hashtags',
  snippets: 'trending:snippets',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single ranked trending entry. */
export interface TrendingScore {
  id: string;
  score: number;
  rank: number;
  computedAt: string;
}

/** Timing/result metadata for a single recompute pass. */
export interface RecomputeResult {
  key: string;
  count: number;
  durationMs: number;
}

/** Aggregate result of a full recompute across all entity types. */
export interface FullRecomputeResult {
  results: RecomputeResult[];
  totalDurationMs: number;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Scoring primitives
// ---------------------------------------------------------------------------

/**
 * Wilson lower-bound score for a Bernoulli parameter.
 *
 * Treats `positives` as successes out of `total` trials and returns the lower
 * bound of the 95% confidence interval. Items with few observations are pulled
 * toward zero, preventing a single interaction from inflating rank.
 *
 * @param positives  Count of positive signals (e.g. likes).
 * @param total      Total observations (e.g. likes + neutral views).
 * @returns          Lower-bound confidence value in the range [0, 1].
 */
export function wilsonLowerBound(positives: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  const phat = positives / total;
  const z = WILSON_Z;
  const z2 = z * z;

  const numerator =
    phat + z2 / (2 * total) - z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  const denominator = 1 + z2 / total;

  return numerator / denominator;
}

/**
 * Exponential time-decay multiplier in the range (0, 1].
 *
 * @param createdAt  Creation timestamp of the entity.
 * @param now        Reference time (defaults to `Date.now()`); injectable for tests.
 * @returns          Decay multiplier where fresher content approaches 1.
 */
export function timeDecay(createdAt: Date | string, now: number = Date.now()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const hours = Math.max(0, (now - created.getTime()) / (1000 * 60 * 60));
  return Math.exp(-TIME_DECAY_CONSTANT * hours);
}

/**
 * Blend a raw engagement magnitude with a Wilson confidence factor and a
 * time-decay multiplier into a single trending score.
 *
 * @param positives  Positive interactions used for confidence.
 * @param total      Total observations used for confidence.
 * @param magnitude  Log-scaled engagement volume that sets the score ceiling.
 * @param createdAt  Creation time used for decay.
 * @param now        Reference time (injectable for tests).
 * @returns          Combined non-negative trending score.
 */
export function blendedScore(
  positives: number,
  total: number,
  magnitude: number,
  createdAt: Date | string,
  now: number = Date.now()
): number {
  const confidence = wilsonLowerBound(positives, total);
  const volume = Math.log10(1 + Math.max(0, magnitude));
  const decay = timeDecay(createdAt, now);
  return confidence * volume * decay * 100;
}

/**
 * Convert an array of scored items into a ranked, capped `TrendingScore[]`.
 *
 * @param items       Items with `id` and `score`, in any order.
 * @param computedAt  ISO timestamp recorded on every entry.
 * @returns           Sorted (desc), rank-assigned, length-capped entries.
 */
function rankEntries(
  items: ReadonlyArray<{ id: string; score: number }>,
  computedAt: string
): TrendingScore[] {
  return [...items]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RANKED_ENTRIES)
    .map((item, index) => ({
      id: item.id,
      score: Number(item.score.toFixed(4)),
      rank: index + 1,
      computedAt,
    }));
}

/** Resolve the start of the default trending window. */
function windowStart(hours: number = TRENDING_WINDOW_HOURS): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// In-memory fallback snapshot
// ---------------------------------------------------------------------------

const memorySnapshot = new Map<string, TrendingScore[]>();

/**
 * Persist a ranked list to Redis and to the in-memory fallback snapshot.
 *
 * @param key      Cache key (one of `TRENDING_CACHE_KEYS`).
 * @param entries  Ranked entries to store.
 */
async function persistRanked(key: string, entries: TrendingScore[]): Promise<void> {
  memorySnapshot.set(key, entries);
  await cache.set(key, entries, CACHE_TTL_SECONDS);
}

/**
 * Read a cached trending list, preferring Redis and falling back to the
 * in-memory snapshot when Redis is unavailable or empty.
 *
 * @param key  Cache key (one of `TRENDING_CACHE_KEYS`).
 * @returns    Ranked entries, or an empty array if nothing is cached.
 */
export async function getCachedTrending(key: string): Promise<TrendingScore[]> {
  const fromRedis = (await cache.get(key)) as TrendingScore[] | null;
  if (Array.isArray(fromRedis) && fromRedis.length > 0) {
    return fromRedis;
  }
  return memorySnapshot.get(key) ?? [];
}

// ---------------------------------------------------------------------------
// Recompute: posts
// ---------------------------------------------------------------------------

/**
 * Recompute trending scores for recent posts and cache the ranked result.
 *
 * Signals: likes, comments, shares form the positive engagement; views provide
 * the denominator for the Wilson confidence term. Recency decay is applied via
 * `timeDecay`.
 *
 * @returns Ranked `TrendingScore[]` (also written to `trending:posts`).
 */
export async function recomputeTrendingPosts(): Promise<TrendingScore[]> {
  const computedAt = new Date().toISOString();
  const posts = await prisma.post.findMany({
    where: {
      createdAt: { gte: windowStart() },
      isArchived: false,
      status: 'PUBLISHED',
    },
    select: {
      id: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,
      viewsCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_LIMIT,
  });

  const scored = posts.map((post) => {
    const positives = post.likesCount + post.commentsCount * 2 + post.sharesCount * 3;
    const total = Math.max(positives, post.viewsCount, positives + 1);
    const magnitude = positives;
    return { id: post.id, score: blendedScore(positives, total, magnitude, post.createdAt) };
  });

  const ranked = rankEntries(scored, computedAt);
  await persistRanked(TRENDING_CACHE_KEYS.posts, ranked);
  return ranked;
}

// ---------------------------------------------------------------------------
// Recompute: repositories
// ---------------------------------------------------------------------------

/**
 * Recompute trending scores for repositories and cache the ranked result.
 *
 * Signals: stars and forks set the engagement magnitude; recent local activity
 * (posts + followers) contributes positive confidence weight. Decay is keyed on
 * `updatedAt` so dormant repos fade out.
 *
 * @returns Ranked `TrendingScore[]` (also written to `trending:repos`).
 */
export async function recomputeTrendingRepos(): Promise<TrendingScore[]> {
  const computedAt = new Date().toISOString();
  const repos = await prisma.repository.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      stars: true,
      forks: true,
      watchers: true,
      postsCount: true,
      followersCount: true,
      updatedAt: true,
    },
    orderBy: { stars: 'desc' },
    take: CANDIDATE_LIMIT,
  });

  const scored = repos.map((repo) => {
    const localActivity = repo.postsCount + repo.followersCount;
    const positives = localActivity + repo.forks;
    const total = Math.max(positives, repo.watchers, positives + 1);
    const magnitude = repo.stars + repo.forks * 2 + localActivity * 5;
    return { id: repo.id, score: blendedScore(positives, total, magnitude, repo.updatedAt) };
  });

  const ranked = rankEntries(scored, computedAt);
  await persistRanked(TRENDING_CACHE_KEYS.repos, ranked);
  return ranked;
}

// ---------------------------------------------------------------------------
// Recompute: developers
// ---------------------------------------------------------------------------

/**
 * Recompute trending scores for developers (users) and cache the result.
 *
 * Signals: followers gained within the window provide positive confidence;
 * aggregate post engagement sets the magnitude. Accounts that are banned or
 * suspended are excluded.
 *
 * @returns Ranked `TrendingScore[]` (also written to `trending:developers`).
 */
export async function recomputeTrendingDevelopers(): Promise<TrendingScore[]> {
  const computedAt = new Date().toISOString();
  const start = windowStart();

  const users = await prisma.user.findMany({
    where: { isBanned: false, isSuspended: false },
    select: {
      id: true,
      createdAt: true,
      _count: {
        select: {
          followers: { where: { createdAt: { gte: start } } },
          posts: { where: { createdAt: { gte: start } } },
        },
      },
    },
    take: CANDIDATE_LIMIT,
  });

  if (users.length === 0) {
    const empty = rankEntries([], computedAt);
    await persistRanked(TRENDING_CACHE_KEYS.developers, empty);
    return empty;
  }

  // Aggregate recent post engagement per author in a single grouped query.
  const engagement = await prisma.post.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: start },
      isArchived: false,
      userId: { in: users.map((u) => u.id) },
    },
    _sum: { likesCount: true, commentsCount: true, sharesCount: true },
  });

  const engagementByUser = new Map<string, number>();
  for (const row of engagement) {
    if (!row.userId) {
      continue;
    }
    const sum =
      (row._sum.likesCount ?? 0) +
      (row._sum.commentsCount ?? 0) * 2 +
      (row._sum.sharesCount ?? 0) * 3;
    engagementByUser.set(row.userId, sum);
  }

  const scored = users.map((user) => {
    const followersGained = user._count.followers;
    const postsMade = user._count.posts;
    const postEngagement = engagementByUser.get(user.id) ?? 0;
    const positives = followersGained + postEngagement;
    const total = Math.max(positives, postsMade * 10, positives + 1);
    const magnitude = followersGained * 3 + postEngagement;
    // Developers decay slowly; anchor decay on recent-window midpoint, not signup.
    return { id: user.id, score: blendedScore(positives, total, magnitude, start) };
  });

  const ranked = rankEntries(scored, computedAt);
  await persistRanked(TRENDING_CACHE_KEYS.developers, ranked);
  return ranked;
}

// ---------------------------------------------------------------------------
// Recompute: hashtags
// ---------------------------------------------------------------------------

/**
 * Recompute trending scores for hashtags and cache the ranked result.
 *
 * Counts hashtag usage across the last 24h and 7d buckets. Recent usage is
 * weighted more heavily so momentum surfaces over all-time popularity.
 *
 * @returns Ranked `TrendingScore[]` (also written to `trending:hashtags`).
 */
export async function recomputeTrendingHashtags(): Promise<TrendingScore[]> {
  const computedAt = new Date().toISOString();
  const recentStart = windowStart(HASHTAG_RECENT_WINDOW_HOURS);
  const extendedStart = windowStart(HASHTAG_EXTENDED_WINDOW_HOURS);

  const [recentCounts, extendedCounts] = await Promise.all([
    prisma.postHashtag.groupBy({
      by: ['hashtagId'],
      where: { createdAt: { gte: recentStart } },
      _count: { hashtagId: true },
    }),
    prisma.postHashtag.groupBy({
      by: ['hashtagId'],
      where: { createdAt: { gte: extendedStart } },
      _count: { hashtagId: true },
    }),
  ]);

  const recentByTag = new Map<string, number>();
  for (const row of recentCounts) {
    recentByTag.set(row.hashtagId, row._count.hashtagId);
  }

  const scored = extendedCounts.map((row) => {
    const recent = recentByTag.get(row.hashtagId) ?? 0;
    const extended = row._count.hashtagId;
    // Recent usage weighted 3x; log-scaled to dampen runaway tags.
    const score = Math.log10(1 + recent * 3 + extended) * 100;
    return { id: row.hashtagId, score };
  });

  const ranked = rankEntries(scored, computedAt);
  await persistRanked(TRENDING_CACHE_KEYS.hashtags, ranked);
  return ranked;
}

// ---------------------------------------------------------------------------
// Recompute: snippets
// ---------------------------------------------------------------------------

/**
 * Recompute trending scores for code snippets and cache the ranked result.
 *
 * Signals: likes provide positive confidence against views; recency decay is
 * applied via `timeDecay` keyed on creation time.
 *
 * @returns Ranked `TrendingScore[]` (also written to `trending:snippets`).
 */
export async function recomputeTrendingSnippets(): Promise<TrendingScore[]> {
  const computedAt = new Date().toISOString();
  const snippets = await prisma.codeSnippet.findMany({
    where: { createdAt: { gte: windowStart(HASHTAG_EXTENDED_WINDOW_HOURS) } },
    select: {
      id: true,
      likesCount: true,
      viewsCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_LIMIT,
  });

  const scored = snippets.map((snippet) => {
    const positives = snippet.likesCount;
    const total = Math.max(positives, snippet.viewsCount, positives + 1);
    const magnitude = snippet.likesCount * 3 + snippet.viewsCount;
    return { id: snippet.id, score: blendedScore(positives, total, magnitude, snippet.createdAt) };
  });

  const ranked = rankEntries(scored, computedAt);
  await persistRanked(TRENDING_CACHE_KEYS.snippets, ranked);
  return ranked;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface RecomputeTask {
  key: string;
  run: () => Promise<TrendingScore[]>;
}

const RECOMPUTE_TASKS: ReadonlyArray<RecomputeTask> = [
  { key: TRENDING_CACHE_KEYS.posts, run: recomputeTrendingPosts },
  { key: TRENDING_CACHE_KEYS.repos, run: recomputeTrendingRepos },
  { key: TRENDING_CACHE_KEYS.developers, run: recomputeTrendingDevelopers },
  { key: TRENDING_CACHE_KEYS.hashtags, run: recomputeTrendingHashtags },
  { key: TRENDING_CACHE_KEYS.snippets, run: recomputeTrendingSnippets },
];

/**
 * Run every recompute pass sequentially, isolating failures so one failing
 * entity type does not abort the others. Logs per-task and total timing.
 *
 * @returns Aggregate timing/result metadata for the full pass.
 */
export async function runFullRecompute(): Promise<FullRecomputeResult> {
  const overallStart = Date.now();
  const results: RecomputeResult[] = [];
  logger.info('[trendingRecompute] Starting full recompute');

  for (const task of RECOMPUTE_TASKS) {
    const taskStart = Date.now();
    try {
      const ranked = await task.run();
      const durationMs = Date.now() - taskStart;
      results.push({ key: task.key, count: ranked.length, durationMs });
      logger.info(
        `[trendingRecompute] ${task.key}: ${ranked.length} entries in ${durationMs}ms`
      );
    } catch (error: unknown) {
      const durationMs = Date.now() - taskStart;
      results.push({ key: task.key, count: 0, durationMs });
      logger.error(`[trendingRecompute] ${task.key} failed after ${durationMs}ms`, error);
    }
  }

  const totalDurationMs = Date.now() - overallStart;
  logger.info(`[trendingRecompute] Full recompute finished in ${totalDurationMs}ms`);

  return {
    results,
    totalDurationMs,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRecomputing = false;

/**
 * Start a recurring trending recompute on a fixed interval.
 *
 * Runs an immediate pass on start, then repeats every `intervalMs`. Overlapping
 * runs are skipped via an in-flight guard so a slow pass cannot stack. Calling
 * this when a scheduler is already running is a no-op.
 *
 * @param intervalMs  Interval between passes (default: 15 minutes).
 * @returns           A `stop` function that clears the scheduler.
 */
export function startTrendingScheduler(
  intervalMs: number = DEFAULT_INTERVAL_MS
): () => void {
  if (schedulerTimer) {
    logger.warn('[trendingRecompute] Scheduler already running; ignoring start request');
    return stopTrendingScheduler;
  }

  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;

  const tick = async (): Promise<void> => {
    if (isRecomputing) {
      logger.warn('[trendingRecompute] Previous pass still running; skipping this tick');
      return;
    }
    isRecomputing = true;
    try {
      await runFullRecompute();
    } catch (error: unknown) {
      logger.error('[trendingRecompute] Scheduled recompute crashed', error);
    } finally {
      isRecomputing = false;
    }
  };

  logger.info(`[trendingRecompute] Scheduler started (interval ${safeInterval}ms)`);
  void tick();
  schedulerTimer = setInterval(() => void tick(), safeInterval);

  // Avoid keeping the Node process alive solely for this timer.
  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }

  return stopTrendingScheduler;
}

/**
 * Stop the recurring trending recompute scheduler, if running.
 */
export function stopTrendingScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('[trendingRecompute] Scheduler stopped');
  }
}
