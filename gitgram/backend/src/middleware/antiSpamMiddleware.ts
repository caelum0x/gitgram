/**
 * Anti-Spam Middleware
 *
 * Combines abuse detection, spam guard, and new account scoring
 * into Express middleware that can be applied to routes.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getStatus, recordViolation, RestrictionLevel } from '../services/abuseDetectionService';
import { checkSpam, getNewAccountMultiplier } from '../services/spamGuardService';
import { logAbuseEvent } from '../services/abuseTelemetryService';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Account Age Enrichment Middleware
// ---------------------------------------------------------------------------

/**
 * Enriches the request with account age information.
 * Should be applied early in the middleware chain (after authentication).
 */
export const enrichAccountAge = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { createdAt: true },
      });

      if (user) {
        const ageHours = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60);
        (req as any).__accountAgeHours = ageHours;
        (req as any).__accountCreatedAt = user.createdAt;
        (req as any).__newAccountMultiplier = getNewAccountMultiplier(user.createdAt);
      }
    }
  } catch (error) {
    // Don't block on failure
    logger.debug('Failed to enrich account age:', error);
  }
  next();
};

// ---------------------------------------------------------------------------
// Abuse Gate Middleware
// ---------------------------------------------------------------------------

/**
 * Checks the user's abuse score and blocks requests if the user is restricted.
 *
 * - Soft restriction: blocks write operations (POST, PUT, DELETE)
 *   but allows reads (GET, HEAD, OPTIONS).
 * - Hard restriction: blocks all operations.
 */
export const abuseGate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) {
    next();
    return;
  }

  const status = await getStatus(req.userId);

  if (!status.isRestricted) {
    next();
    return;
  }

  const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (status.restrictionLevel === 'hard') {
    void logAbuseEvent(req.userId, 'HARD_RESTRICT_BLOCK', `${req.method} ${req.path}`, {
      restrictionLevel: status.restrictionLevel,
      restrictedUntil: status.restrictedUntil,
    });
    logger.warn(`Abuse gate: HARD restriction blocked request for userId=${req.userId} ${req.method} ${req.path}`);
    res.status(403).json({
      error: 'Account temporarily restricted',
      message: 'Your account has been temporarily restricted due to suspicious activity. Please try again later.',
      restrictedUntil: status.restrictedUntil
        ? new Date(status.restrictedUntil).toISOString()
        : null,
      restrictionLevel: 'hard',
    });
    return;
  }

  if (status.restrictionLevel === 'soft' && isWriteMethod) {
    void logAbuseEvent(req.userId, 'SOFT_RESTRICT_BLOCK', `${req.method} ${req.path}`, {
      restrictionLevel: status.restrictionLevel,
      restrictedUntil: status.restrictedUntil,
    });
    logger.warn(`Abuse gate: SOFT restriction blocked write for userId=${req.userId} ${req.method} ${req.path}`);
    res.status(403).json({
      error: 'Write operations temporarily restricted',
      message: 'Your account is in read-only mode due to suspicious activity. Please try again later.',
      restrictedUntil: status.restrictedUntil
        ? new Date(status.restrictedUntil).toISOString()
        : null,
      restrictionLevel: 'soft',
    });
    return;
  }

  // Soft restriction but read-only request - allow through
  next();
};

// ---------------------------------------------------------------------------
// Spam Check Middleware Factory
// ---------------------------------------------------------------------------

/**
 * Creates middleware that checks for spam before allowing the request through.
 *
 * @param action - The action type (e.g., 'post', 'comment', 'follow', 'like')
 * @param options - Configuration options
 */
export function spamCheck(
  action: string,
  options: {
    /** Field name in req.body that contains the content to check. Defaults to 'content'. */
    contentField?: string;
    /** Field name in req.params for the target ID. Defaults to 'id'. */
    targetIdParam?: string;
    /** Whether this action involves content that should be similarity-checked. */
    hasContent?: boolean;
  } = {}
) {
  const {
    contentField = 'content',
    targetIdParam = 'id',
    hasContent = true,
  } = options;

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      next();
      return;
    }

    const content = hasContent ? (req.body?.[contentField] || '') : '';
    const targetId = req.params?.[targetIdParam] || req.body?.[targetIdParam];

    const result = await checkSpam(req.userId, content, action, targetId);

    if (result.blocked) {
      void logAbuseEvent(req.userId, 'SPAM_BLOCK', `${action}:${result.reason || 'blocked'}`, {
        action,
        violations: result.violations,
        score: result.score,
      });
      logger.warn(
        `Spam blocked: userId=${req.userId} action=${action} reason=${result.reason}`
      );

      res.status(429).json({
        error: 'Request blocked by spam detection',
        message: result.reason || 'Suspicious activity detected. Please slow down.',
        violations: result.violations,
      });
      return;
    }

    // Attach spam score to request for downstream logging
    (req as any).__spamScore = result.score;
    (req as any).__spamViolations = result.violations;

    next();
  };
}

// ---------------------------------------------------------------------------
// Convenience Middleware Instances
// ---------------------------------------------------------------------------

/** Spam check for creating posts */
export const spamCheckPost = spamCheck('post', { contentField: 'content', hasContent: true });

/** Spam check for creating comments */
export const spamCheckComment = spamCheck('comment', { contentField: 'content', hasContent: true });

/** Spam check for follow actions */
export const spamCheckFollow = spamCheck('follow', { hasContent: false, targetIdParam: 'id' });

/** Spam check for like/reaction actions */
export const spamCheckReaction = spamCheck('like', { hasContent: false, targetIdParam: 'id' });

/** Spam check for report submissions */
export const spamCheckReport = spamCheck('report', {
  contentField: 'description',
  hasContent: true,
  targetIdParam: 'targetId',
});

/** Spam check for appeal submissions */
export const spamCheckAppeal = spamCheck('appeal', {
  contentField: 'appealText',
  hasContent: true,
  targetIdParam: 'moderationLogId',
});
