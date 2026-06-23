import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { moderateUser } from '../services/moderationService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getModerationQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { action = 'review', limit = 50 } = req.query;

  const logs = await prisma.moderationLog.findMany({
    where: { action: action as string },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });

  res.json(logs);
});

export const reviewContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { decision } = req.body; // approve or reject

  const log = await prisma.moderationLog.update({
    where: { id },
    data: { action: decision },
  });

  res.json(log);
});

export const checkUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const result = await moderateUser(userId);

  res.json(result);
});

export const getModerationStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [total, approved, rejected, review, flagged] = await Promise.all([
    prisma.moderationLog.count(),
    prisma.moderationLog.count({ where: { action: 'approve' } }),
    prisma.moderationLog.count({ where: { action: 'reject' } }),
    prisma.moderationLog.count({ where: { action: 'review' } }),
    prisma.moderationLog.count({ where: { action: 'flag' } }),
  ]);

  const actionCounts = await prisma.moderationLog.groupBy({
    by: ['action'],
    _count: true,
    orderBy: { _count: { action: 'desc' } },
    take: 10,
  });

  res.json({
    total,
    approved,
    rejected,
    review,
    flagged,
    topActions: actionCounts,
  });
});
