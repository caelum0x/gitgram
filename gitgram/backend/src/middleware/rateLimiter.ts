import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../utils/logger';

// Custom key generator that combines IP and user ID if available
const keyGenerator = (req: Request): string => {
  const userId = (req as any).userId;
  const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
  return userId ? `${ip}-${userId}` : ip;
};

// Rate limit exceeded handler
const rateLimitHandler = (req: Request, res: Response) => {
  logger.warn(`Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`);
  res.status(429).json({
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Authentication rate limiter
 * Strict limits for login/register to prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
  skipSuccessfulRequests: false,
});

/**
 * Password reset rate limiter
 * Very strict to prevent abuse
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: 'Too many password reset attempts, please try again after an hour',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Key by email + IP to prevent enumeration
    const email = req.body?.email?.toLowerCase() || '';
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
    return `${ip}-${email}`;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`Password reset rate limit exceeded: ${req.ip} - ${req.body?.email}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
    });
  },
});

/**
 * Token refresh rate limiter
 * Moderate limits
 */
export const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 refresh attempts per 15 minutes
  message: 'Too many token refresh attempts',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * General API rate limiter
 * More permissive for normal operations
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Upload rate limiter
 * Strict to prevent abuse and resource exhaustion
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: 'Too many uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Interaction rate limiter (likes, comments, follows)
 * Moderate limits to prevent spam
 */
export const interactionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 interactions per minute
  message: 'Too many interactions, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * Search rate limiter
 * Prevent search abuse and enumeration
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * Email sending rate limiter
 * Very strict to prevent email abuse
 */
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 emails per hour
  message: 'Too many email requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * Admin actions rate limiter
 * Moderate limits for admin operations
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 admin actions per minute
  message: 'Too many admin requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * Account deletion rate limiter
 * Very strict - only allow 1 attempt per day
 */
export const accountDeletionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1, // 1 attempt per day
  message: 'Account deletion can only be attempted once per day',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

/**
 * Data export rate limiter
 * Strict to prevent resource abuse
 */
export const dataExportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 exports per day
  message: 'Data export limit reached, please try again tomorrow',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});
