import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const reactToStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { type } = req.body;
  const userId = req.userId!;

  const validTypes = ['heart', 'fire', 'laugh', 'wow', 'sad', 'angry'];
  if (!validTypes.includes(type)) {
    throw Errors.badRequest('Invalid reaction type');
  }

  const reaction = await prisma.storyReaction.upsert({
    where: { storyId_userId: { storyId: id, userId } },
    update: { type },
    create: { storyId: id, userId, type },
  });

  res.json(reaction);
});

export const removeReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  await prisma.storyReaction.delete({
    where: { storyId_userId: { storyId: id, userId } },
  });

  res.json({ message: 'Reaction removed' });
});

export const replyToStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.userId!;

  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!story) {
    throw Errors.notFound('Story');
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw Errors.badRequest('Reply content is required');
  }

  if (story.userId) {
    const settings = await prisma.storySettings.findUnique({
      where: { userId: story.userId },
      select: { allowReplies: true, hideFrom: true },
    });

    if (settings?.allowReplies === false) {
      throw Errors.forbidden('Replies are disabled for this user\'s stories');
    }

    if (settings?.hideFrom?.includes(userId)) {
      throw Errors.forbidden('You cannot interact with this user\'s stories');
    }
  }

  const reply = await prisma.storyReply.create({
    data: { storyId: id, userId, content: content.trim() },
    include: { story: { include: { user: true } } },
  });

  // Create notification for story owner
  if (reply.story.userId && reply.story.userId !== userId) {
    await prisma.notification.create({
      data: {
        userId: reply.story.userId,
        actorId: userId,
        type: 'STORY_REPLY',
        content: `replied to your story`,
      },
    });
  }

  res.json(reply);
});

export const getStoryReplies = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const replies = await prisma.storyReply.findMany({
    where: { storyId: id },
    include: { user: { select: { id: true, username: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(replies);
});

export const getStoryReactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const reactions = await prisma.storyReaction.groupBy({
    by: ['type'],
    where: { storyId: id },
    _count: { type: true }
  });

  const result = reactions.reduce((acc, r) => ({ ...acc, [r.type]: r._count.type }), {});
  res.json(result);
});
