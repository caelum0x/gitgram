import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { Errors } from "./errors.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

/**
 * Plan-based rate limits
 * - Per-minute limits for burst protection
 * - Per-month limits for quota management
 */
export const RATE_LIMITS = {
  free: {
    requestsPerMinute: 10,
    requestsPerMonth: 1_000,
  },
  pro: {
    requestsPerMinute: 100,
    requestsPerMonth: 100_000,
  },
  team: {
    requestsPerMinute: 500,
    requestsPerMonth: 500_000,
  },
  enterprise: {
    requestsPerMinute: 2000,
    requestsPerMonth: 2_000_000,
  },
};

type PlanType = keyof typeof RATE_LIMITS;

/**
 * Per-endpoint rate limits (requests per minute)
 * These override the plan-based per-minute limit for specific endpoints.
 * If an endpoint is not listed here, the plan-based limit applies.
 */
export const ENDPOINT_LIMITS: Record<string, number> = {
  '/v1/universal-search': 30,  // 30/min
  '/v1/query': 30,
  '/v1/oracle': 5,             // 5/min
  '/v1/deep-research': 5,
  '/v1/restore': 60,           // 60/min
  '/v1/web-search': 10,        // 10/min
};

/**
 * Optional Redis backend for distributed rate limiting.
 * Activates when process.env.REDIS_URL is set.
 * Falls back to in-memory if Redis is unavailable or operations fail.
 */
let redisClient: any = null;

async function initRedis(): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    // Dynamic import to avoid requiring redis as a hard dependency
    // @ts-ignore - redis is an optional peer dependency
    const { createClient } = await import(/* webpackIgnore: true */ 'redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err: Error) => {
      logger.warn("Rate limiter: Redis error", { error: err.message });
    });
    await redisClient.connect();
    logger.info("Rate limiter: Redis backend connected");
  } catch (err) {
    logger.warn("Rate limiter: Redis unavailable, using in-memory fallback");
    redisClient = null;
  }
}
initRedis();

/**
 * Get the current count from Redis for a given key and window.
 * Returns null if Redis is not available or the operation fails.
 */
async function getRedisCount(key: string, windowMs: number): Promise<number | null> {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(key);
    return val !== null ? parseInt(val, 10) : 0;
  } catch (err) {
    logger.warn("Rate limiter: Redis GET failed, falling back to in-memory");
    return null;
  }
}

/**
 * Increment the counter in Redis for a given key and window.
 * Sets an expiry on the key equal to the window duration.
 * Returns the new count, or null if Redis is unavailable.
 */
async function incrementRedisCount(key: string, windowMs: number): Promise<number | null> {
  if (!redisClient) return null;
  try {
    const newCount = await redisClient.incr(key);
    // Set expiry only when the key is first created (count === 1)
    if (newCount === 1) {
      await redisClient.expire(key, Math.ceil(windowMs / 1000));
    }
    return newCount;
  } catch (err) {
    logger.warn("Rate limiter: Redis INCR failed, falling back to in-memory");
    return null;
  }
}

/**
 * In-memory rate limit tracking
 * Tracks both per-minute and per-month usage per API key
 */
interface RateLimitEntry {
  // Per-minute tracking
  minuteCount: number;
  minuteWindowStart: number;

  // Per-month tracking
  monthCount: number;
  monthWindowStart: number;

  // For DB sync
  lastSyncedAt: number;
  pendingCount: number; // Requests since last sync
}

// Store keyed by API key ID (or IP for unauthenticated)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Sync interval: every 60 seconds
const DB_SYNC_INTERVAL_MS = 60_000;

// Pending sync threshold: sync after this many requests
const PENDING_SYNC_THRESHOLD = 50;

/**
 * Get the start of the current month (UTC)
 */
function getMonthWindowStart(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
}

/**
 * Get the start of the current minute window
 */
function getMinuteWindowStart(): number {
  const now = Date.now();
  return now - (now % 60_000);
}

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  const currentMonthStart = getMonthWindowStart();

  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries from previous months that haven't been accessed
    if (entry.monthWindowStart < currentMonthStart && entry.lastSyncedAt < now - 3600_000) {
      rateLimitStore.delete(key);
    }
  }
}, 300_000); // Clean every 5 minutes

/**
 * Periodic DB sync for usage tracking
 */
setInterval(async () => {
  await syncAllPendingUsage();
}, DB_SYNC_INTERVAL_MS);

/**
 * Sync all pending usage to database
 */
async function syncAllPendingUsage(): Promise<void> {
  const now = Date.now();

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.pendingCount > 0 && key.startsWith("apikey:")) {
      try {
        const apiKeyId = key.replace("apikey:", "");
        await syncUsageToDb(apiKeyId, entry);
        entry.pendingCount = 0;
        entry.lastSyncedAt = now;
      } catch (error) {
        logger.error("Failed to sync usage", error instanceof Error ? error : undefined, { key, details: String(error) });
      }
    }
  }
}

/**
 * Sync usage to database for an API key
 * This updates the usage tracking in the database for billing/analytics
 */
async function syncUsageToDb(apiKeyId: string, entry: RateLimitEntry): Promise<void> {
  // Update the lastUsedAt timestamp on the API key
  // In a production system, you might have a separate usage table
  try {
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, apiKeyId));
  } catch (error) {
    // Log but don't throw - rate limiting should work even if DB sync fails
    logger.error("Failed to sync API key usage", error instanceof Error ? error : undefined, { details: String(error) });
  }
}

/**
 * Get rate limit key for a request
 * Prioritizes API key ID, falls back to IP for unauthenticated requests
 */
function getRateLimitKey(req: AuthenticatedRequest): string {
  // Use API key ID if authenticated
  if (req.apiKeyId) {
    return `apikey:${req.apiKeyId}`;
  }

  // Fall back to user ID if available
  if (req.user?.userId) {
    return `user:${req.user.userId}`;
  }

  // Get IP from various headers (for proxies) or connection
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string) ||
    req.socket?.remoteAddress ||
    "unknown";

  return `ip:${ip}`;
}

/**
 * Get or create rate limit entry for a key
 */
function getOrCreateEntry(key: string): RateLimitEntry {
  const now = Date.now();
  const currentMinuteStart = getMinuteWindowStart();
  const currentMonthStart = getMonthWindowStart();

  let entry = rateLimitStore.get(key);

  if (!entry) {
    entry = {
      minuteCount: 0,
      minuteWindowStart: currentMinuteStart,
      monthCount: 0,
      monthWindowStart: currentMonthStart,
      lastSyncedAt: now,
      pendingCount: 0,
    };
    rateLimitStore.set(key, entry);
  }

  // Reset minute counter if we're in a new minute window
  if (currentMinuteStart > entry.minuteWindowStart) {
    entry.minuteCount = 0;
    entry.minuteWindowStart = currentMinuteStart;
  }

  // Reset month counter if we're in a new month
  if (currentMonthStart > entry.monthWindowStart) {
    entry.monthCount = 0;
    entry.monthWindowStart = currentMonthStart;
  }

  return entry;
}

/**
 * Resolve the request path to check against ENDPOINT_LIMITS.
 * Strips trailing slashes and matches the originalUrl against known endpoints.
 */
function getEndpointPath(req: AuthenticatedRequest): string {
  // req.originalUrl includes the full mounted path (e.g., /v1/oracle?q=test)
  // We strip query strings and trailing slashes for matching
  const fullPath = (req.originalUrl || req.path || '').split('?')[0].replace(/\/+$/, '');
  return fullPath;
}

/**
 * Get the effective per-minute limit for a request.
 * If the endpoint has a specific limit configured, use the minimum of
 * the endpoint limit and the plan-based limit. Otherwise use the plan limit.
 */
function getEffectiveMinuteLimit(req: AuthenticatedRequest, planLimit: number): number {
  const endpointPath = getEndpointPath(req);

  // Check for an exact match first
  if (ENDPOINT_LIMITS[endpointPath] !== undefined) {
    return Math.min(ENDPOINT_LIMITS[endpointPath], planLimit);
  }

  // Check for prefix matches (e.g., /v1/restore/abc matches /v1/restore)
  for (const [pattern, limit] of Object.entries(ENDPOINT_LIMITS)) {
    if (endpointPath.startsWith(pattern + '/') || endpointPath === pattern) {
      return Math.min(limit, planLimit);
    }
  }

  return planLimit;
}

/**
 * Set standard rate limit headers on response
 */
function setRateLimitHeaders(
  res: Response,
  limits: typeof RATE_LIMITS.free,
  entry: RateLimitEntry,
  effectiveMinuteLimit: number
): void {
  const now = Date.now();

  // Calculate reset times
  const minuteReset = entry.minuteWindowStart + 60_000;
  const monthReset = new Date(
    new Date(entry.monthWindowStart).getUTCFullYear(),
    new Date(entry.monthWindowStart).getUTCMonth() + 1,
    1
  ).getTime();

  // Per-minute headers (uses effective limit which may be endpoint-specific)
  res.setHeader("X-RateLimit-Limit", effectiveMinuteLimit);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, effectiveMinuteLimit - entry.minuteCount));
  res.setHeader("X-RateLimit-Reset", Math.ceil(minuteReset / 1000));

  // Monthly quota headers
  res.setHeader("X-RateLimit-Limit-Month", limits.requestsPerMonth);
  res.setHeader("X-RateLimit-Remaining-Month", Math.max(0, limits.requestsPerMonth - entry.monthCount));
  res.setHeader("X-RateLimit-Reset-Month", Math.ceil(monthReset / 1000));
}

/**
 * Main rate limiting middleware
 * Checks both per-minute and per-month limits based on user's plan.
 * Supports per-endpoint overrides and optional Redis backend.
 */
export function rateLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const key = getRateLimitKey(req);
  const entry = getOrCreateEntry(key);

  // Determine plan (default to free for unauthenticated)
  const plan = (req.user?.plan || "free") as PlanType;
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

  // Calculate the effective per-minute limit (may be reduced by endpoint config)
  const effectiveMinuteLimit = getEffectiveMinuteLimit(req, limits.requestsPerMinute);

  // Build a per-endpoint key for endpoint-specific tracking
  const endpointPath = getEndpointPath(req);
  const endpointKey = `${key}:endpoint:${endpointPath}`;
  const endpointEntry = getOrCreateEntry(endpointKey);

  // Increment counters on the main entry (for plan-level + month tracking)
  entry.minuteCount++;
  entry.monthCount++;
  entry.pendingCount++;

  // Increment the per-endpoint minute counter separately
  endpointEntry.minuteCount++;

  // Determine which minute count to use for limit checking:
  // If there is an endpoint-specific limit, use the endpoint-scoped counter.
  // Otherwise, use the main entry counter (plan-level).
  const hasEndpointLimit = ENDPOINT_LIMITS[endpointPath] !== undefined ||
    Object.keys(ENDPOINT_LIMITS).some(p => endpointPath.startsWith(p + '/'));
  const activeMinuteCount = hasEndpointLimit ? endpointEntry.minuteCount : entry.minuteCount;
  const activeEntry = hasEndpointLimit ? endpointEntry : entry;

  // If Redis is available, attempt distributed rate limiting asynchronously.
  // We use a fire-and-check pattern: attempt Redis increment, and if the
  // result exceeds the limit, reject. On Redis failure, fall back to in-memory.
  if (redisClient) {
    const minuteWindowStart = getMinuteWindowStart();
    const redisMinuteKey = `rl:min:${hasEndpointLimit ? endpointKey : key}:${minuteWindowStart}`;
    const redisMonthKey = `rl:month:${key}:${getMonthWindowStart()}`;

    // Run Redis checks asynchronously then continue
    Promise.all([
      incrementRedisCount(redisMinuteKey, 60_000),
      incrementRedisCount(redisMonthKey, 31 * 24 * 60 * 60 * 1000),
    ]).then(([redisMinuteCount, redisMonthCount]) => {
      // Use Redis counts if available, otherwise fall through to in-memory
      const minuteCount = redisMinuteCount ?? activeMinuteCount;
      const monthCount = redisMonthCount ?? entry.monthCount;

      // Sync Redis counts back to in-memory entry for header accuracy
      if (redisMinuteCount !== null) {
        activeEntry.minuteCount = redisMinuteCount;
      }
      if (redisMonthCount !== null) {
        entry.monthCount = redisMonthCount;
      }

      // Set rate limit headers
      setRateLimitHeaders(res, limits, activeEntry, effectiveMinuteLimit);

      // Check per-minute limit (burst protection)
      if (minuteCount > effectiveMinuteLimit) {
        const retryAfter = Math.ceil((activeEntry.minuteWindowStart + 60_000 - Date.now()) / 1000);
        res.setHeader("Retry-After", Math.max(1, retryAfter));

        return res.status(429).json({
          error: {
            type: "rate_limit_exceeded",
            code: "rate_limit_exceeded",
            message: "Rate limit exceeded. Too many requests per minute.",
            details: {
              retry_after: Math.max(1, retryAfter),
              limit_type: "minute",
              limit: effectiveMinuteLimit,
              current: minuteCount,
            },
          },
        });
      }

      // Check per-month limit (quota)
      if (monthCount > limits.requestsPerMonth) {
        const nextMonth = new Date(
          new Date(entry.monthWindowStart).getUTCFullYear(),
          new Date(entry.monthWindowStart).getUTCMonth() + 1,
          1
        ).getTime();
        const retryAfter = Math.ceil((nextMonth - Date.now()) / 1000);

        res.setHeader("Retry-After", retryAfter);

        return res.status(429).json({
          error: {
            type: "rate_limit_exceeded",
            code: "monthly_quota_exceeded",
            message: "Monthly API quota exceeded. Please upgrade your plan or wait until next month.",
            details: {
              retry_after: retryAfter,
              limit_type: "month",
              limit: limits.requestsPerMonth,
              current: monthCount,
              upgrade_url: "https://timemachine.gitgram.app/pricing",
            },
          },
        });
      }

      // Trigger DB sync if we've accumulated enough pending requests
      if (entry.pendingCount >= PENDING_SYNC_THRESHOLD && key.startsWith("apikey:")) {
        const apiKeyId = key.replace("apikey:", "");
        syncUsageToDb(apiKeyId, entry).then(() => {
          entry.pendingCount = 0;
          entry.lastSyncedAt = Date.now();
        }).catch((err) => logger.error("DB sync error", err instanceof Error ? err : undefined, { details: String(err) }));
      }

      next();
    }).catch(() => {
      // Redis completely failed - fall through to in-memory path below
      handleInMemoryRateLimit(req, res, next, key, entry, activeEntry, activeMinuteCount, limits, effectiveMinuteLimit);
    });

    return; // Async path - don't fall through
  }

  // In-memory path (no Redis)
  handleInMemoryRateLimit(req, res, next, key, entry, activeEntry, activeMinuteCount, limits, effectiveMinuteLimit);
}

/**
 * In-memory rate limit check (used when Redis is not available or fails)
 */
function handleInMemoryRateLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  key: string,
  entry: RateLimitEntry,
  activeEntry: RateLimitEntry,
  activeMinuteCount: number,
  limits: typeof RATE_LIMITS.free,
  effectiveMinuteLimit: number
): void {
  // Set rate limit headers
  setRateLimitHeaders(res, limits, activeEntry, effectiveMinuteLimit);

  // Check per-minute limit first (burst protection)
  if (activeMinuteCount > effectiveMinuteLimit) {
    const retryAfter = Math.ceil((activeEntry.minuteWindowStart + 60_000 - Date.now()) / 1000);
    res.setHeader("Retry-After", Math.max(1, retryAfter));

    const error = Errors.rateLimitExceeded(retryAfter);
    return void res.status(429).json({
      error: {
        type: "rate_limit_exceeded",
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded. Too many requests per minute.",
        details: {
          retry_after: Math.max(1, retryAfter),
          limit_type: "minute",
          limit: effectiveMinuteLimit,
          current: activeMinuteCount,
        },
      },
    });
  }

  // Check per-month limit (quota)
  if (entry.monthCount > limits.requestsPerMonth) {
    // Calculate seconds until next month
    const nextMonth = new Date(
      new Date(entry.monthWindowStart).getUTCFullYear(),
      new Date(entry.monthWindowStart).getUTCMonth() + 1,
      1
    ).getTime();
    const retryAfter = Math.ceil((nextMonth - Date.now()) / 1000);

    res.setHeader("Retry-After", retryAfter);

    return void res.status(429).json({
      error: {
        type: "rate_limit_exceeded",
        code: "monthly_quota_exceeded",
        message: "Monthly API quota exceeded. Please upgrade your plan or wait until next month.",
        details: {
          retry_after: retryAfter,
          limit_type: "month",
          limit: limits.requestsPerMonth,
          current: entry.monthCount,
          upgrade_url: "https://timemachine.gitgram.app/pricing",
        },
      },
    });
  }

  // Trigger DB sync if we've accumulated enough pending requests
  if (entry.pendingCount >= PENDING_SYNC_THRESHOLD && key.startsWith("apikey:")) {
    const apiKeyId = key.replace("apikey:", "");
    syncUsageToDb(apiKeyId, entry).then(() => {
      entry.pendingCount = 0;
      entry.lastSyncedAt = Date.now();
    }).catch((err) => logger.error("DB sync error", err instanceof Error ? err : undefined, { details: String(err) }));
  }

  next();
}

/**
 * Stricter rate limiting for sensitive endpoints (e.g., auth, key generation)
 */
export function strictRateLimit(maxPerMinute: number = 10) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const baseKey = getRateLimitKey(req);
    const key = `strict:${baseKey}:${req.path}`;
    const now = Date.now();
    const currentMinuteStart = getMinuteWindowStart();

    let entry = rateLimitStore.get(key);

    if (!entry || currentMinuteStart > entry.minuteWindowStart) {
      entry = {
        minuteCount: 0,
        minuteWindowStart: currentMinuteStart,
        monthCount: 0,
        monthWindowStart: getMonthWindowStart(),
        lastSyncedAt: now,
        pendingCount: 0,
      };
      rateLimitStore.set(key, entry);
    }

    entry.minuteCount++;

    const minuteReset = entry.minuteWindowStart + 60_000;

    res.setHeader("X-RateLimit-Limit", maxPerMinute);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxPerMinute - entry.minuteCount));
    res.setHeader("X-RateLimit-Reset", Math.ceil(minuteReset / 1000));

    if (entry.minuteCount > maxPerMinute) {
      const retryAfter = Math.ceil((minuteReset - now) / 1000);
      res.setHeader("Retry-After", Math.max(1, retryAfter));

      return res.status(429).json({
        error: {
          type: "rate_limit_exceeded",
          code: "rate_limit_exceeded",
          message: "Rate limit exceeded for this endpoint.",
          details: {
            retry_after: Math.max(1, retryAfter),
            limit: maxPerMinute,
          },
        },
      });
    }

    next();
  };
}

/**
 * Get current rate limit status for a user/API key
 */
export function getRateLimitStatus(
  identifier: string,
  identifierType: "apikey" | "user" | "ip" = "user",
  plan: PlanType = "free"
): {
  minute: { count: number; limit: number; remaining: number; reset: number };
  month: { count: number; limit: number; remaining: number; reset: number };
} {
  const key = `${identifierType}:${identifier}`;
  const entry = getOrCreateEntry(key);
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

  const minuteReset = entry.minuteWindowStart + 60_000;
  const monthReset = new Date(
    new Date(entry.monthWindowStart).getUTCFullYear(),
    new Date(entry.monthWindowStart).getUTCMonth() + 1,
    1
  ).getTime();

  return {
    minute: {
      count: entry.minuteCount,
      limit: limits.requestsPerMinute,
      remaining: Math.max(0, limits.requestsPerMinute - entry.minuteCount),
      reset: minuteReset,
    },
    month: {
      count: entry.monthCount,
      limit: limits.requestsPerMonth,
      remaining: Math.max(0, limits.requestsPerMonth - entry.monthCount),
      reset: monthReset,
    },
  };
}

/**
 * Manually reset rate limits for a specific key (admin use)
 */
export function resetRateLimits(
  identifier: string,
  identifierType: "apikey" | "user" | "ip" = "user"
): void {
  const key = `${identifierType}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Get all rate limit entries (for monitoring/debugging)
 */
export function getAllRateLimitEntries(): Map<string, RateLimitEntry> {
  return new Map(rateLimitStore);
}

// ============================================================================
// Simple factory rate limiters (lightweight, no plan/DB integration)
// ============================================================================

interface SimpleRateLimitEntry {
  count: number;
  resetAt: number;
}

const simpleStore = new Map<string, SimpleRateLimitEntry>();

// Clean up expired simple entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of simpleStore) {
    if (entry.resetAt < now) {
      simpleStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Generic rate-limit factory.
 *
 * Creates a standalone middleware that applies an in-memory window counter
 * keyed by client IP (or x-forwarded-for). Returns 429 with a structured
 * error body when the limit is exceeded.
 *
 * @param windowMs  Length of the rolling window in milliseconds
 * @param max       Maximum requests allowed within the window
 */
export function createRateLimit(windowMs: number, max: number) {
  return function simpleLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ??
      req.socket?.remoteAddress ??
      "unknown";

    const key = `simple:${ip}:${windowMs}:${max}`;
    const now = Date.now();

    let entry = simpleStore.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 1, resetAt: now + windowMs };
      simpleStore.set(key, entry);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", max - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
      return next();
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({
        error: {
          type: "RATE_LIMIT",
          message: "Too many requests",
          retryAfter,
        },
      });
      return;
    }

    next();
  };
}

/** General API endpoints: 100 requests per minute */
export const apiRateLimit = createRateLimit(60 * 1000, 100);

/** Auth endpoints: 10 requests per minute (brute-force protection) */
export const authRateLimit = createRateLimit(60 * 1000, 10);

/** Sensitive / expensive endpoints: 5 requests per minute */
export const strictSimpleRateLimit = createRateLimit(60 * 1000, 5);
