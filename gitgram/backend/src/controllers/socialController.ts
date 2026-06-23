import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { socialGraphService } from '../services/socialGraphService';
import prisma from '../utils/prisma';
import { blockService } from '../services/blockService';
import { createFollowNotification } from '../services/notificationService';

/**
 * GET /api/v1/social/suggested-users
 * Returns users suggested for the authenticated user to follow.
 */
export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 10;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw Errors.badRequest('limit must be an integer between 1 and 50');
  }

  const { users, total } = await socialGraphService.getSuggestedUsers(userId, rawLimit);

  res.json({ users, total });
});

/**
 * GET /api/v1/social/mutual-followers/:targetUserId
 * Returns followers shared between the authenticated user and the target user.
 */
export const getMutualFollowers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { targetUserId } = req.params;

  if (!targetUserId) {
    throw Errors.badRequest('targetUserId is required');
  }

  const { users, count } = await socialGraphService.getMutualFollowers(userId, targetUserId);

  res.json({ users, count });
});

/**
 * GET /api/v1/social/follow-suggestions
 * Returns follow suggestions derived from GitHub connections or friends-of-friends.
 */
export const getFollowSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const { suggestions, source } = await socialGraphService.getFollowSuggestions(userId);

  res.json({ suggestions, source });
});

/**
 * GET /api/v1/social/activity-feed
 * Returns a cursor-paginated activity feed for the authenticated user.
 */
export const getActivityFeed = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const cursorParam = req.query.cursor as string | undefined;
  if (cursorParam !== undefined) {
    const parsed = new Date(cursorParam);
    if (isNaN(parsed.getTime())) {
      throw Errors.badRequest('cursor must be a valid ISO 8601 date string');
    }
  }

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw Errors.badRequest('limit must be an integer between 1 and 50');
  }

  const { events, nextCursor, hasMore } = await socialGraphService.getActivityFeed(
    userId,
    cursorParam,
    rawLimit,
  );

  res.json({ events, nextCursor, hasMore });
});

/**
 * POST /api/v1/social/follow/:userId
 * Follow a user. Returns { following: true }.
 * If the user is already followed this is idempotent (still 200).
 */
export const followUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const actorId = authReq.userId!;
  const { userId } = req.params;

  if (userId === actorId) {
    throw Errors.badRequest('Cannot follow yourself');
  }

  const hasBlock = await blockService.hasBlockRelationship(actorId, userId);
  if (hasBlock) {
    throw Errors.forbidden('Cannot follow this user');
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!target) {
    throw Errors.notFound('User');
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: actorId, followingId: userId } },
  });

  if (!existing) {
    await prisma.follow.create({
      data: { followerId: actorId, followingId: userId },
    });

    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true },
    });
    if (actor?.username) {
      await createFollowNotification(userId, actorId, actor.username);
    }
  }

  res.json({ following: true });
});

/**
 * DELETE /api/v1/social/follow/:userId
 * Unfollow a user. Returns { following: false }.
 * If the user is not currently followed this is idempotent (still 200).
 */
export const unfollowUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const actorId = authReq.userId!;
  const { userId } = req.params;

  if (userId === actorId) {
    throw Errors.badRequest('Cannot unfollow yourself');
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: actorId, followingId: userId } },
  });

  if (existing) {
    await prisma.follow.delete({
      where: { followerId_followingId: { followerId: actorId, followingId: userId } },
    });
  }

  res.json({ following: false });
});

/**
 * GET /api/v1/social/followers/:userId
 * Cursor-paginated list of followers for a given user.
 * Query params:
 *   cursor - ISO 8601 date (createdAt of the last item on the previous page)
 *   limit  - integer 1-50, default 20
 */
export const getUserFollowers = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw Errors.badRequest('limit must be an integer between 1 and 50');
  }

  const cursorParam = req.query.cursor as string | undefined;
  let cursorDate: Date | undefined;
  if (cursorParam !== undefined) {
    cursorDate = new Date(cursorParam);
    if (isNaN(cursorDate.getTime())) {
      throw Errors.badRequest('cursor must be a valid ISO 8601 date string');
    }
  }

  const follows = await prisma.follow.findMany({
    where: {
      followingId: userId,
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: rawLimit + 1,
    include: {
      follower: {
        select: { id: true, username: true, avatar: true, bio: true, verified: true },
      },
    },
  });

  const hasMore = follows.length > rawLimit;
  const page = follows.slice(0, rawLimit);
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : undefined;

  res.json({
    followers: page.map((f) => f.follower),
    nextCursor,
    hasMore,
  });
});

/**
 * GET /api/v1/social/following/:userId
 * Cursor-paginated list of users that a given user is following.
 * Query params:
 *   cursor - ISO 8601 date (createdAt of the last item on the previous page)
 *   limit  - integer 1-50, default 20
 */
export const getUserFollowing = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw Errors.badRequest('limit must be an integer between 1 and 50');
  }

  const cursorParam = req.query.cursor as string | undefined;
  let cursorDate: Date | undefined;
  if (cursorParam !== undefined) {
    cursorDate = new Date(cursorParam);
    if (isNaN(cursorDate.getTime())) {
      throw Errors.badRequest('cursor must be a valid ISO 8601 date string');
    }
  }

  const follows = await prisma.follow.findMany({
    where: {
      followerId: userId,
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: rawLimit + 1,
    include: {
      following: {
        select: { id: true, username: true, avatar: true, bio: true, verified: true },
      },
    },
  });

  const hasMore = follows.length > rawLimit;
  const page = follows.slice(0, rawLimit);
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : undefined;

  res.json({
    following: page.map((f) => f.following),
    nextCursor,
    hasMore,
  });
});
