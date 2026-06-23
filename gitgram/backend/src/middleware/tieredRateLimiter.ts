/**
 * Tiered Rate Limiter
 *
 * Provides per-IP and per-user rate limiting using in-memory stores.
 * Stores can be replaced with Redis-backed stores later.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { IP_RATE_LIMITS, USER_RATE_LIMITS, SPAM_CONFIG } from '../config/rateLimitConfig';
import logger from '../utils/logger';
import { recordViolation } from '../services/abuseDetectionService';
import { RedisSlidingWindow } from '../utils/redisStores';

// ---------------------------------------------------------------------------
// Shared store instances (Redis-backed with in-memory fallback)
// ---------------------------------------------------------------------------

export const ipStore = new RedisSlidingWindow('rl:ip');
export const userStore = new RedisSlidingWindow('rl:user');

// Periodic cleanup of in-memory fallback every 5 minutes
const cleanupTimer = setInterval(() => {
  ipStore.cleanupFallback();
  userStore.cleanupFallback();
}, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Helper: Extract IP from request
// ---------------------------------------------------------------------------

function getClientIP(req: Request): string {
  // Trust X-Forwarded-For in production behind a proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ---------------------------------------------------------------------------
// Per-IP Rate Limiter Factory
// ---------------------------------------------------------------------------

export type IPRateLimitTier = keyof typeof IP_RATE_LIMITS;

export function ipRateLimit(tier: IPRateLimitTier) {
  const config = IP_RATE_LIMITS[tier];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIP(req);
    const key = `${tier}:${ip}`;
    const { count } = await ipStore.hit(key, config.windowMs);

    // Set standard rate limit headers
    const remaining = Math.max(0, config.max - count);
    if (typeof (res as any).setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + config.windowMs) / 1000));
    }

    if (count > config.max) {
      const retryAfterSec = Math.ceil(config.windowMs / 1000);
      if (typeof (res as any).setHeader === 'function') {
        res.setHeader('Retry-After', retryAfterSec);
      }

      logger.warn(`IP rate limit exceeded: tier=${tier} ip=${ip} count=${count} max=${config.max}`);

      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded for ${tier.toLowerCase()} requests. Please try again later.`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Per-User Rate Limiter Factory
// ---------------------------------------------------------------------------

export type UserRateLimitAction = keyof typeof USER_RATE_LIMITS;

export function userRateLimit(action: UserRateLimitAction) {
  const config = USER_RATE_LIMITS[action];

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      // Not authenticated -- skip user rate limiting
      next();
      return;
    }

    const key = `${action}:${userId}`;
    let effectiveMax = config.max;

    // Apply stricter limits for new accounts
    const accountAge = (req as any).__accountAgeHours;
    if (typeof accountAge === 'number' && accountAge < SPAM_CONFIG.NEW_ACCOUNT_AGE_HOURS) {
      effectiveMax = Math.ceil(config.max * SPAM_CONFIG.NEW_ACCOUNT_LIMIT_MULTIPLIER);
    }

    const { count } = await userStore.hit(key, config.windowMs);

    // Set standard rate limit headers
    const remaining = Math.max(0, effectiveMax - count);
    if (typeof (res as any).setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', effectiveMax);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + config.windowMs) / 1000));
    }

    if (count > effectiveMax) {
      const retryAfterSec = Math.ceil(config.windowMs / 1000);
      if (typeof (res as any).setHeader === 'function') {
        res.setHeader('Retry-After', retryAfterSec);
      }

      void recordViolation(userId, 'RATE_LIMIT_HIT', `action=${action}`);

      logger.warn(
        `User rate limit exceeded: action=${action} userId=${userId} count=${count} max=${effectiveMax}` +
        (typeof accountAge === 'number' ? ` accountAgeHours=${accountAge.toFixed(1)}` : '')
      );

      res.status(429).json({
        error: 'Too many requests',
        message: `You have exceeded the ${action.toLowerCase()} rate limit. Please slow down.`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Convenience middleware instances
// ---------------------------------------------------------------------------

/** Per-IP: general API 100/min */
export const ipApiLimit = ipRateLimit('GENERAL_API');

/** Per-IP: auth endpoints 10/min */
export const ipAuthLimit = ipRateLimit('AUTH');

/** Per-IP: upload endpoints 20/min */
export const ipUploadLimit = ipRateLimit('UPLOADS');

/** Per-user: posts 30/hour */
export const userPostLimit = userRateLimit('POSTS');

/** Per-user: comments 60/hour */
export const userCommentLimit = userRateLimit('COMMENTS');

/** Per-user: reactions 120/hour */
export const userReactionLimit = userRateLimit('REACTIONS');

/** Per-user: follows 50/hour */
export const userFollowLimit = userRateLimit('FOLLOWS');

/** Per-user: reports 20/hour */
export const userReportLimit = userRateLimit('REPORTS');

/** Per-user: appeals 8/day */
export const userAppealLimit = userRateLimit('APPEALS');

/** Per-user (staff): moderation actions 240/hour */
export const userModerationActionLimit = userRateLimit('MODERATION_ACTIONS');
