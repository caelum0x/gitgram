import rateLimit from 'express-rate-limit';

// More granular rate limiters for different endpoints
export const createRateLimiter = (
  windowMs: number,
  max: number,
  message?: string
) => {
  return rateLimit({
    windowMs,
    max,
    message: message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message || 'Too many requests, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

// Specific rate limiters
export const uploadLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // 10 uploads per 15 minutes
  'Too many uploads, please try again later.'
);

export const searchLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  30, // 30 searches per minute
  'Too many search requests, please try again later.'
);

export const interactionLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  100, // 100 interactions per minute
  'Too many interactions, please try again later.'
);

export const messageLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  50, // 50 messages per minute
  'Too many messages, please try again later.'
);

