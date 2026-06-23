/**
 * Rate Limiting Middleware
 *
 * Comprehensive rate limiting configuration using express-rate-limit.
 * Each limiter is tuned for its specific use case and returns structured
 * error responses with { error: { type, message, retryAfter } }.
 *
 * Key generators prefer authenticated userId over IP address so that
 * shared NAT/proxy environments do not penalise innocent users.
 */

import rateLimit, { Options, ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitErrorBody {
  error: {
    type: 'rate_limit_exceeded';
    message: string;
    retryAfter: string | number | undefined;
  };
}

// ---------------------------------------------------------------------------
// Health-check skip predicate
// ---------------------------------------------------------------------------

/**
 * Returns true for endpoints that should never be rate-limited.
 * Health probes from load-balancers must not be throttled.
 */
export function isHealthEndpoint(req: Request): boolean {
  const healthPaths = ['/health', '/healthz', '/ready', '/readyz', '/ping', '/livez'];
  return healthPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`));
}

// ---------------------------------------------------------------------------
// Key generator — userId > IP
// ---------------------------------------------------------------------------

/**
 * Uses the authenticated userId when present so that individual users are
 * rate-limited regardless of IP sharing, and falls back to the client IP
 * for unauthenticated requests.
 */
export function buildKeyGenerator(req: Request): string {
  const userId = (req as Request & { userId?: string }).userId;
  const ip = ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
  return userId ? `user:${userId}` : `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Handler factory — builds a structured 429 response
// ---------------------------------------------------------------------------

function buildHandler(message: string) {
  return (req: Request, res: Response): void => {
    const retryAfter = res.getHeader('Retry-After');
    logger.warn(`Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`);

    const body: RateLimitErrorBody = {
      error: {
        type: 'rate_limit_exceeded',
        message,
        retryAfter: retryAfter as string | number | undefined,
      },
    };

    res.status(429).json(body);
  };
}

// ---------------------------------------------------------------------------
// Shared option defaults
// ---------------------------------------------------------------------------

const baseOptions: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildKeyGenerator,
  skip: isHealthEndpoint,
};

// ---------------------------------------------------------------------------
// generalLimiter — broad protection for all routes (100 req / 15 min)
// ---------------------------------------------------------------------------

export const generalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: buildHandler(
    'Too many requests. Please wait 15 minutes before trying again.'
  ),
});

// ---------------------------------------------------------------------------
// authLimiter — login / register / forgot-password (10 req / 15 min)
// ---------------------------------------------------------------------------

export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: buildHandler(
    'Too many authentication attempts. Please wait 15 minutes before trying again.'
  ),
});

// ---------------------------------------------------------------------------
// apiLimiter — general API endpoints (1 000 req / 15 min)
// ---------------------------------------------------------------------------

export const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  handler: buildHandler(
    'API rate limit exceeded. Please slow down your request rate.'
  ),
});

// ---------------------------------------------------------------------------
// uploadLimiter — file upload endpoints (10 req / 1 hour)
// ---------------------------------------------------------------------------

export const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  max: 10,
  handler: buildHandler(
    'Upload limit exceeded. You may upload up to 10 files per hour.'
  ),
});

// ---------------------------------------------------------------------------
// webhookLimiter — incoming webhook endpoints (1 000 req / 1 min)
// ---------------------------------------------------------------------------

export const webhookLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 1000,
  handler: buildHandler(
    'Webhook rate limit exceeded. Please reduce delivery frequency.'
  ),
});

// ---------------------------------------------------------------------------
// strictLimiter — dangerous operations, e.g. account deletion (5 req / 1 hour)
// ---------------------------------------------------------------------------

export const strictLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: buildHandler(
    'This operation is strictly rate-limited. Please wait before trying again.'
  ),
});
