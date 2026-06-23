import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../utils/prisma';
import rateLimit from 'express-rate-limit';

export const createPremiumRateLimiter = (options: {
  freeLimit: number;
  premiumLimit: number;
  windowMs: number;
}) => {
  const freeLimiter = rateLimit({
    windowMs: options.windowMs,
    max: options.freeLimit,
    message: 'Too many requests, please upgrade to Premium for higher limits',
  });

  const premiumLimiter = rateLimit({
    windowMs: options.windowMs,
    max: options.premiumLimit,
  });

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return freeLimiter(req, res, next);
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.userId! }
    });

    const isPremium = subscription &&
      subscription.plan && ['premium', 'creator'].includes(subscription.plan) &&
      subscription.status === 'active';

    if (isPremium) {
      return premiumLimiter(req, res, next);
    }

    return freeLimiter(req, res, next);
  };
};

// Usage examples
export const apiLimiter = createPremiumRateLimiter({
  freeLimit: 100,
  premiumLimit: 1000,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export const uploadLimiter = createPremiumRateLimiter({
  freeLimit: 10,
  premiumLimit: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
});
