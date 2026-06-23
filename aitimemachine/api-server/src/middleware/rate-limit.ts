import { Request, Response, NextFunction } from "express";
import { Errors } from "./errors.js";
import { logger } from "../lib/monitoring.js";

/**
 * Simple in-memory rate limiter
 * For production, use Redis-backed rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Max requests per window */
  maxRequests: number;
  /** Key extractor (default: IP address) */
  keyExtractor?: (req: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Handler when rate limit exceeded (default: throw ApiError) */
  onLimitReached?: (req: Request, res: Response) => void;
}

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;
const BURST_WINDOW_MS = 1000; // 1 second burst window
const BURST_MAX_REQUESTS = 20;

// In-memory storage (use Redis for distributed systems)
const rateLimitStore = new Map<string, RateLimitEntry>();
const burstLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
  for (const [key, entry] of burstLimitStore) {
    if (entry.resetAt < now) {
      burstLimitStore.delete(key);
    }
  }
}, 60 * 1000);

/**
 * Extract rate limit key from request
 */
function defaultKeyExtractor(req: Request): string {
  // Use API key if available, otherwise IP
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey) {
    return `apikey:${apiKey.slice(0, 16)}`;
  }
  
  // Use forwarded IP if behind proxy
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return `ip:${ip.trim()}`;
  }
  
  return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

/**
 * Check rate limit and increment counter
 */
function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, entry);
    return { allowed: true, remaining: maxRequests - 1, resetAt: entry.resetAt };
  }

  entry.count++;
  
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { 
      allowed: false, 
      remaining: 0, 
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  return { 
    allowed: true, 
    remaining: maxRequests - entry.count, 
    resetAt: entry.resetAt,
  };
}

/**
 * Create rate limit middleware
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    maxRequests = DEFAULT_MAX_REQUESTS,
    keyExtractor = defaultKeyExtractor,
    skip,
    onLimitReached,
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (skip?.(req)) {
      return next();
    }

    const key = keyExtractor(req);
    const result = checkRateLimit(rateLimitStore, key, windowMs, maxRequests);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter || 60);
      
      if (onLimitReached) {
        return onLimitReached(req, res);
      }
      
      const error = Errors.rateLimitExceeded(result.retryAfter);
      return res.status(error.statusCode).json(error.toResponse());
    }

    next();
  };
}

/**
 * Burst rate limiter - prevents 500s under sudden burst
 * More restrictive short-term limit
 */
export function burstRateLimit(config: Partial<RateLimitConfig> = {}) {
  const {
    windowMs = BURST_WINDOW_MS,
    maxRequests = BURST_MAX_REQUESTS,
    keyExtractor = defaultKeyExtractor,
    skip,
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) {
      return next();
    }

    const key = `burst:${keyExtractor(req)}`;
    const result = checkRateLimit(burstLimitStore, key, windowMs, maxRequests);

    if (!result.allowed) {
      // Log burst detection for monitoring
      logger.warn("Burst detected", { key, retryAfter: result.retryAfter });
      
      const error = Errors.rateLimitExceeded(result.retryAfter);
      return res.status(error.statusCode).json(error.toResponse());
    }

    next();
  };
}

/**
 * Combined rate limiter with both burst and window limits
 */
export function combinedRateLimit(config?: {
  burstRequests?: number;
  windowRequests?: number;
  windowMs?: number;
  skip?: (req: Request) => boolean;
}) {
  const burstMiddleware = burstRateLimit({
    maxRequests: config?.burstRequests || BURST_MAX_REQUESTS,
    skip: config?.skip,
  });
  
  const windowMiddleware = rateLimit({
    maxRequests: config?.windowRequests || DEFAULT_MAX_REQUESTS,
    windowMs: config?.windowMs || DEFAULT_WINDOW_MS,
    skip: config?.skip,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    burstMiddleware(req, res, (err?: any) => {
      if (err) return next(err);
      windowMiddleware(req, res, next);
    });
  };
}

/**
 * Endpoint-specific rate limits
 */
export const rateLimits = {
  /** Standard API endpoints */
  standard: rateLimit({ maxRequests: 100, windowMs: 60 * 1000 }),
  
  /** Search endpoints (more expensive) */
  search: rateLimit({ maxRequests: 30, windowMs: 60 * 1000 }),
  
  /** Write operations */
  write: rateLimit({ maxRequests: 50, windowMs: 60 * 1000 }),
  
  /** Auth endpoints (prevent brute force) */
  auth: rateLimit({ maxRequests: 10, windowMs: 60 * 1000 }),
  
  /** Expensive operations (embeddings, etc) */
  expensive: rateLimit({ maxRequests: 10, windowMs: 60 * 1000 }),
  
  /** Health check (no limit) */
  health: rateLimit({ skip: () => true }),
};

export default rateLimit;
