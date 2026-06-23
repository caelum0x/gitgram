import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  let prefs = await prisma.notificationPreferences.findUnique({
    where: { userId }
  });

  if (!prefs) {
    prefs = await prisma.notificationPreferences.create({
      data: {
        userId,
        likes: true,
        comments: true,
        follows: true,
        mentions: true,
        messages: true,
        posts: true,
      }
    });
  }

  res.json(prefs);
});

export const updatePreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { likes, comments, follows, mentions, messages, posts } = req.body;

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      likes,
      comments,
      follows,
      mentions,
      messages,
      posts,
    },
    update: {
      likes,
      comments,
      follows,
      mentions,
      messages,
      posts,
    }
  });

  res.json(prefs);
});
