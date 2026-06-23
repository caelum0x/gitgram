import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import {
  getFollowerAnalytics,
  getEngagementAnalytics,
  getContentPerformance,
} from '../services/userAnalyticsService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Validate that the target user exists and the requester has access.
 * Public profiles are accessible to anyone authenticated.
 * Private profiles are only accessible to the profile owner.
 */
async function validateUserAccess(
  requesterId: string | undefined,
  targetUserId: string,
): Promise<void> {
  if (!requesterId) {
    throw Errors.unauthorized('Authentication required');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isPrivate: true },
  });

  if (!targetUser) {
    throw Errors.notFound('User');
  }

  // Private profiles: only the owner can see analytics
  if (targetUser.isPrivate && targetUser.id !== requesterId) {
    throw Errors.forbidden('This user\'s analytics are private');
  }
}

/**
 * GET /api/v1/analytics/engagement/:userId
 * Returns engagement metrics for a specific user.
 */
export const getUserEngagement = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { userId } = req.params;
  const { days = 30 } = req.query;

  await validateUserAccess(authReq.userId, userId);

  const data = await getEngagementAnalytics(userId, Number(days));
  res.json(data);
});

/**
 * GET /api/v1/analytics/followers/:userId
 * Returns follower growth analytics for a specific user.
 */
export const getUserFollowers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { userId } = req.params;
  const { days = 30 } = req.query;

  await validateUserAccess(authReq.userId, userId);

  const data = await getFollowerAnalytics(userId, Number(days));
  res.json(data);
});

/**
 * GET /api/v1/analytics/content/:userId
 * Returns content performance metrics for a specific user.
 */
export const getUserContent = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { userId } = req.params;
  const { days = 30, limit = 20 } = req.query;

  await validateUserAccess(authReq.userId, userId);

  const data = await getContentPerformance(userId, Number(days), Number(limit));
  res.json(data);
});
