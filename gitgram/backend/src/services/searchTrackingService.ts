// Tracks search queries and exposes the most popular ("trending") queries.
//
// Primary store: a Redis sorted set keyed per time-bucket so that trends
// reflect a rolling recent window rather than all-time totals. Each bucket
// expires automatically. If Redis is unavailable we fall back to a bounded
// in-memory counter so the feature degrades gracefully in dev/test.

import redisClient from './redisService';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface TrendingQuery {
  query: string;
  count: number;
}

/** Length of a single trending bucket window. */
const BUCKET_MS = 60 * 60 * 1000; // 1 hour
/** Number of recent buckets aggregated when computing trends. */
const WINDOW_BUCKETS = 24; // last 24 hours
/** TTL applied to each bucket key (slightly longer than the window). */
const BUCKET_TTL_SECONDS = Math.ceil((BUCKET_MS * (WINDOW_BUCKETS + 1)) / 1000);
const KEY_PREFIX = 'search:trending:';
/** Normalised queries longer than this are ignored to bound key size. */
const MAX_QUERY_LEN = 200;
/** Cap on distinct queries retained in the in-memory fallback. */
const MEMORY_MAX_KEYS = 5_000;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Lower-case, collapse whitespace, and trim. Returns '' for invalid input. */
export function normalizeQuery(raw: string): string {
  if (typeof raw !== 'string') return '';
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || normalized.length > MAX_QUERY_LEN) return '';
  return normalized;
}

function currentBucketId(now: number = Date.now()): number {
  return Math.floor(now / BUCKET_MS);
}

function bucketKey(bucketId: number): string {
  return `${KEY_PREFIX}${bucketId}`;
}

// ---------------------------------------------------------------------------
// In-memory fallback (used when Redis is down)
// ---------------------------------------------------------------------------

interface MemoryBucket {
  bucketId: number;
  counts: Map<string, number>;
}

const memoryBuckets: MemoryBucket[] = [];

function memoryTrack(query: string, bucketId: number): void {
  let bucket = memoryBuckets.find((b) => b.bucketId === bucketId);
  if (!bucket) {
    bucket = { bucketId, counts: new Map() };
    memoryBuckets.push(bucket);
    // Drop buckets outside the window.
    const cutoff = bucketId - WINDOW_BUCKETS;
    for (let i = memoryBuckets.length - 1; i >= 0; i--) {
      if (memoryBuckets[i].bucketId < cutoff) memoryBuckets.splice(i, 1);
    }
  }
  if (bucket.counts.size >= MEMORY_MAX_KEYS && !bucket.counts.has(query)) return;
  bucket.counts.set(query, (bucket.counts.get(query) ?? 0) + 1);
}

function memoryTrending(limit: number, currentId: number): TrendingQuery[] {
  const cutoff = currentId - WINDOW_BUCKETS + 1;
  const totals = new Map<string, number>();
  for (const bucket of memoryBuckets) {
    if (bucket.bucketId < cutoff) continue;
    for (const [query, count] of bucket.counts) {
      totals.set(query, (totals.get(query) ?? 0) + count);
    }
  }
  return [...totals.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count || (a.query < b.query ? -1 : 1))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a single occurrence of a search query. Fire-and-forget safe:
 * never throws — failures are logged and ignored.
 */
export async function trackQuery(rawQuery: string): Promise<void> {
  const query = normalizeQuery(rawQuery);
  if (!query) return;

  const bucketId = currentBucketId();

  if (!redisClient.isOpen) {
    memoryTrack(query, bucketId);
    return;
  }

  try {
    const key = bucketKey(bucketId);
    await redisClient.zIncrBy(key, 1, query);
    await redisClient.expire(key, BUCKET_TTL_SECONDS);
  } catch (error) {
    logger.error('searchTrackingService: trackQuery failed, using memory', error);
    memoryTrack(query, bucketId);
  }
}

/**
 * Returns the top `limit` trending queries aggregated over the recent window.
 */
export async function getTrendingQueries(limit = 10): Promise<TrendingQuery[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 10, 1), 50);
  const currentId = currentBucketId();

  if (!redisClient.isOpen) {
    return memoryTrending(safeLimit, currentId);
  }

  try {
    // Aggregate the recent buckets into a temporary destination set.
    const sourceKeys: string[] = [];
    for (let i = 0; i < WINDOW_BUCKETS; i++) {
      sourceKeys.push(bucketKey(currentId - i));
    }

    const totals = new Map<string, number>();
    for (const key of sourceKeys) {
      // zRangeWithScores returns ascending; we aggregate all members.
      const members = await redisClient.zRangeWithScores(key, 0, -1);
      for (const { value, score } of members) {
        totals.set(value, (totals.get(value) ?? 0) + score);
      }
    }

    return [...totals.entries()]
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count || (a.query < b.query ? -1 : 1))
      .slice(0, safeLimit);
  } catch (error) {
    logger.error('searchTrackingService: getTrendingQueries failed, using memory', error);
    return memoryTrending(safeLimit, currentId);
  }
}

/** Test-only helper to clear the in-memory fallback state. */
export function __resetForTests(): void {
  memoryBuckets.length = 0;
}
