import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const blockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const blockerId = req.user!.id;

  await prisma.userBlock.create({
    data: { blockerId, blockedId: userId },
  });

  res.json({ message: 'User blocked' });
});

export const unblockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const blockerId = req.user!.id;

  await prisma.userBlock.deleteMany({
    where: { blockerId, blockedId: userId },
  });

  res.json({ message: 'User unblocked' });
});

export const getBlockedUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: userId },
  });

  const blockedUserIds = blocks.map(b => b.blockedId);
  const blockedUsers = await prisma.user.findMany({
    where: { id: { in: blockedUserIds } },
    select: { id: true, username: true, avatar: true },
  });

  res.json(blockedUsers);
});

export const reportContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId, reason } = req.body;
  const userId = req.user!.id;

  await prisma.postReport.create({
    data: { userId, postId, reason },
  });

  res.json({ message: 'Report submitted' });
});
