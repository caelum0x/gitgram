import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { blockService } from '../services/blockService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Block a user
 * POST /api/v1/users/:id/block
 */
export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const userId = authReq.userId!;

  if (id === userId) {
    throw Errors.badRequest('Cannot block yourself');
  }

  try {
    await blockService.blockUser(userId, id);
  } catch (error: any) {
    if (error instanceof ApiError) throw error;

    if (error.message === 'User not found') {
      throw Errors.notFound('User');
    }
    if (error.message === 'User is already blocked') {
      throw Errors.badRequest('User is already blocked');
    }

    throw error;
  }

  res.json({ message: 'User blocked successfully' });
});

/**
 * Unblock a user
 * DELETE /api/v1/users/:id/block
 */
export const unblockUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const userId = authReq.userId!;

  if (id === userId) {
    throw Errors.badRequest('Cannot unblock yourself');
  }

  try {
    await blockService.unblockUser(userId, id);
  } catch (error: any) {
    if (error instanceof ApiError) throw error;

    if (error.message === 'User is not blocked') {
      throw Errors.badRequest('User is not blocked');
    }

    throw error;
  }

  res.json({ message: 'User unblocked successfully' });
});

/**
 * Get list of blocked users
 * GET /api/v1/users/blocked
 */
export const getBlockedUsers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { page = 1, limit = 20 } = req.query;

  const result = await blockService.getBlockedUsers(
    userId,
    Number(page),
    Number(limit)
  );

  res.json(result);
});
