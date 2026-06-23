/**
 * cacheMiddleware.ts
 *
 * Redis-backed HTTP response caching middleware using ioredis.
 *
 * Usage:
 *   router.get('/trending', cacheMiddleware.medium, handler)
 *   router.get('/topics',   cacheMiddleware.long,   handler)
 *
 * Gracefully degrades to pass-through when Redis is unavailable.
 */

import { Request, RequestHandler, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Redis client — lazily initialised once
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let connectionAttempted = false;

function getRedis(): Redis | null {
  if (connectionAttempted) return redis;
  connectionAttempted = true;

  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

  try {
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 100, 1000)),
    });

    client.on('error', () => {
      // Suppress noisy error logs after first failure; middleware degrades gracefully.
      redis = null;
    });

    client.connect().catch(() => {
      redis = null;
    });

    redis = client;
  } catch {
    redis = null;
  }

  return redis;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

interface CachedResponse {
  status: number;
  body: unknown;
}

// ---------------------------------------------------------------------------
// Cache key builder
// ---------------------------------------------------------------------------

function buildCacheKey(req: AuthenticatedRequest): string {
  const userId = req.user?.id ?? 'anon';
  return `cache:${req.method}:${req.originalUrl}:${userId}`;
}

// ---------------------------------------------------------------------------
// Core middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns an Express middleware that caches GET responses in Redis.
 *
 * @param ttlSeconds - Time-to-live for cached entries in seconds.
 */
export function createCache(ttlSeconds: number): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache successful GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const client = getRedis();
    const key = buildCacheKey(req as AuthenticatedRequest);

    // --- Cache hit path ---
    if (client) {
      try {
        const cached = await client.get(key);
        if (cached !== null) {
          const parsed = JSON.parse(cached) as CachedResponse;
          res.set('X-Cache', 'HIT');
          res.status(parsed.status).json(parsed.body);
          return;
        }
      } catch {
        // Redis read failure — continue without cache
      }
    }

    // --- Cache miss path ---
    res.set('X-Cache', 'MISS');

    // Wrap res.json to intercept the outgoing body
    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    res.json = function capturingJson(body: unknown): Response {
      if (res.statusCode === 200 && client) {
        const payload: CachedResponse = { status: res.statusCode, body };
        client
          .setex(key, ttlSeconds, JSON.stringify(payload))
          .catch(() => {
            // Best-effort write; ignore failures
          });
      }
      return originalJson(body);
    };

    next();
  };
}

// ---------------------------------------------------------------------------
// Invalidation helper
// ---------------------------------------------------------------------------

/**
 * Deletes all cache keys matching the given glob pattern.
 *
 * @param pattern - Redis glob pattern, e.g. `"cache:GET:/users/*"`.
 * @returns Number of keys deleted, or 0 if Redis is unavailable.
 */
export async function invalidateCache(pattern: string): Promise<number> {
  const client = getRedis();
  if (!client) return 0;

  let deleted = 0;

  try {
    const stream = client.scanStream({ match: pattern, count: 100 });

    for await (const keys of stream) {
      const batch = keys as string[];
      if (batch.length > 0) {
        const count = await client.del(...batch);
        deleted += count;
      }
    }
  } catch {
    // Swallow errors — caller gets best-effort count
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// Preset cache durations
// ---------------------------------------------------------------------------

/**
 * Preset middleware instances for common TTL durations.
 *
 * @example
 *   router.get('/feed',     cacheMiddleware.short,  handler) // 1 min
 *   router.get('/profile',  cacheMiddleware.medium, handler) // 5 min
 *   router.get('/topics',   cacheMiddleware.long,   handler) // 1 hour
 */
export const cacheMiddleware = {
  /** 60 seconds — feeds, notifications */
  short: createCache(60),
  /** 300 seconds (5 min) — profiles, repositories */
  medium: createCache(300),
  /** 3600 seconds (1 hour) — static data: languages, topics */
  long: createCache(3600),
} as const;
