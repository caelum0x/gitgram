import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { createNotification } from '../services/notificationService';
import { blockService } from '../services/blockService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Send a follow request (for private accounts)
 * POST /api/v1/follow-requests
 */
export const sendFollowRequest = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { targetId } = req.body;
  const requesterId = authReq.userId!;

  if (targetId === requesterId) {
    throw Errors.badRequest('Cannot follow yourself');
  }

  // Check if there's a block relationship between users
  const hasBlock = await blockService.hasBlockRelationship(requesterId, targetId);
  if (hasBlock) {
    throw Errors.forbidden('Cannot follow this user');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, isPrivate: true, username: true }
  });

  if (!targetUser) {
    throw Errors.notFound('User');
  }

  // Check if already following
  const existingFollow = await prisma.follow.findFirst({
    where: { followerUserId: requesterId, followingUserId: targetId }
  });

  if (existingFollow) {
    throw Errors.badRequest('Already following this user');
  }

  // Check for existing pending request
  const existingRequest = await prisma.followRequest.findUnique({
    where: { requesterId_targetId: { requesterId, targetId } }
  });

  if (existingRequest) {
    if (existingRequest.status === 'pending') {
      throw Errors.badRequest('Follow request already pending');
    }
    // If rejected, allow re-request
  }

  // If target account is public, follow directly
  if (!targetUser.isPrivate) {
    const requesterAccount = await prisma.account.findFirst({ where: { userId: requesterId } });
    const targetAccount = await prisma.account.findFirst({ where: { userId: targetId } });

    if (requesterAccount && targetAccount) {
      await prisma.follow.create({
        data: {
          followerId: requesterAccount.id,
          followingId: targetAccount.id,
          followerUserId: requesterId,
          followingUserId: targetId
        }
      });

      // Notify
      const requester = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { username: true }
      });

      await createNotification(
        targetId,
        'FOLLOW',
        `${requester?.username || 'Someone'} started following you`,
        requesterId
      );

      return res.json({ status: 'following', message: 'Now following user' });
    }
  }

  // Create follow request for private account
  const request = await prisma.followRequest.upsert({
    where: { requesterId_targetId: { requesterId, targetId } },
    create: { requesterId, targetId, status: 'pending' },
    update: { status: 'pending', updatedAt: new Date() }
  });

  // Notify target user
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { username: true }
  });

  await createNotification(
    targetId,
    'FOLLOW',
    `${requester?.username || 'Someone'} requested to follow you`,
    requesterId
  );

  res.status(201).json({ status: 'pending', request });
});

/**
 * Get pending follow requests (for current user)
 * GET /api/v1/follow-requests
 */
export const getFollowRequests = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { page = '1', limit = '20' } = req.query;

  const requests = await prisma.followRequest.findMany({
    where: { targetId: userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  // Get requester details
  const requesterIds = requests.map(r => r.requesterId);
  const requesters = await prisma.user.findMany({
    where: { id: { in: requesterIds } },
    select: { id: true, username: true, avatar: true, bio: true }
  });

  const requestsWithUsers = requests.map(request => ({
    ...request,
    requester: requesters.find(u => u.id === request.requesterId)
  }));

  const total = await prisma.followRequest.count({
    where: { targetId: userId, status: 'pending' }
  });

  res.json({
    requests: requestsWithUsers,
    total,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: requests.length === parseInt(limit as string)
    }
  });
});

/**
 * Accept a follow request
 * POST /api/v1/follow-requests/:requestId/accept
 */
export const acceptFollowRequest = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { requestId } = req.params;
  const userId = authReq.userId!;

  const request = await prisma.followRequest.findUnique({
    where: { id: requestId }
  });

  if (!request) {
    throw Errors.notFound('Follow request');
  }

  if (request.targetId !== userId) {
    throw Errors.forbidden('Not authorized to accept this request');
  }

  if (request.status !== 'pending') {
    throw Errors.badRequest('Request is no longer pending');
  }

  const requesterAccount = await prisma.account.findFirst({ where: { userId: request.requesterId } });
  const targetAccount = await prisma.account.findFirst({ where: { userId: userId } });

  if (!requesterAccount || !targetAccount) {
    throw Errors.badRequest('Account not found');
  }

  await prisma.$transaction([
    prisma.followRequest.update({
      where: { id: requestId },
      data: { status: 'accepted' }
    }),
    prisma.follow.create({
      data: {
        followerId: requesterAccount.id,
        followingId: targetAccount.id,
        followerUserId: request.requesterId,
        followingUserId: userId
      }
    })
  ]);

  // Notify requester
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true }
  });

  await createNotification(
    request.requesterId,
    'FOLLOW',
    `${targetUser?.username || 'Someone'} accepted your follow request`,
    userId
  );

  res.json({ message: 'Follow request accepted' });
});

/**
 * Reject a follow request
 * POST /api/v1/follow-requests/:requestId/reject
 */
export const rejectFollowRequest = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { requestId } = req.params;
  const userId = authReq.userId!;

  const request = await prisma.followRequest.findUnique({
    where: { id: requestId }
  });

  if (!request) {
    throw Errors.notFound('Follow request');
  }

  if (request.targetId !== userId) {
    throw Errors.forbidden('Not authorized to reject this request');
  }

  await prisma.followRequest.update({
    where: { id: requestId },
    data: { status: 'rejected' }
  });

  res.json({ message: 'Follow request rejected' });
});

/**
 * Cancel a sent follow request
 * DELETE /api/v1/follow-requests/:targetId
 */
export const cancelFollowRequest = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { targetId } = req.params;
  const requesterId = authReq.userId!;

  const request = await prisma.followRequest.findUnique({
    where: { requesterId_targetId: { requesterId, targetId } }
  });

  if (!request) {
    throw Errors.notFound('Follow request');
  }

  if (request.status !== 'pending') {
    throw Errors.badRequest('Request is no longer pending');
  }

  await prisma.followRequest.delete({ where: { id: request.id } });

  res.json({ message: 'Follow request cancelled' });
});

/**
 * Get follow request status
 * GET /api/v1/follow-requests/status/:targetId
 */
export const getFollowRequestStatus = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { targetId } = req.params;
  const requesterId = authReq.userId!;

  // Check if already following
  const existingFollow = await prisma.follow.findFirst({
    where: { followerUserId: requesterId, followingUserId: targetId }
  });

  if (existingFollow) {
    return res.json({ status: 'following' });
  }

  // Check for pending request
  const request = await prisma.followRequest.findUnique({
    where: { requesterId_targetId: { requesterId, targetId } }
  });

  if (request) {
    return res.json({ status: request.status });
  }

  res.json({ status: 'none' });
});
