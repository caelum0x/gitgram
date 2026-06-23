import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const createStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { mediaUrl, mediaType = 'image' } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { account: { select: { id: true } } }
  });
  if (!user?.account?.id) {
    throw Errors.badRequest('User has no account');
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const story = await prisma.story.create({
    data: { accountId: user.account.id, userId, mediaUrl, mediaType, expiresAt },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  res.status(201).json(story);
});

export const getStories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true }
  });

  const followingIds = following.map(f => f.followingId);
  followingIds.push(userId);

  const stories = await prisma.story.findMany({
    where: {
      userId: { in: followingIds },
      expiresAt: { gt: new Date() }
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(stories);
});

export const getStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const story = await prisma.story.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  if (!story) {
    throw Errors.notFound('Story');
  }

  if (story.expiresAt < new Date()) {
    return res.status(410).json({ error: 'Story expired' });
  }

  // Record view
  await prisma.storyView.upsert({
    where: {
      storyId_userId: { storyId: id, userId }
    },
    create: { storyId: id, userId },
    update: {}
  });

  await prisma.story.update({
    where: { id },
    data: { viewsCount: { increment: 1 } }
  });

  res.json(story);
});

export const deleteStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const story = await prisma.story.findUnique({ where: { id } });

  if (!story) {
    throw Errors.notFound('Story');
  }

  if (story.userId !== userId) {
    throw Errors.forbidden('Unauthorized');
  }

  await prisma.story.delete({ where: { id } });

  res.json({ message: 'Story deleted' });
});

export const getStoryViews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const story = await prisma.story.findUnique({ where: { id } });

  if (!story) {
    throw Errors.notFound('Story');
  }

  if (story.userId !== userId) {
    throw Errors.forbidden('Unauthorized');
  }

  const views = await prisma.storyView.findMany({
    where: { storyId: id },
    select: { userId: true }
  });

  const userIds = views.map(v => v.userId).filter((id): id is string => id !== null);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatar: true }
  });

  res.json({ views: users });
});
