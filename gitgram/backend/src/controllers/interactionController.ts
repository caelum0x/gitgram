import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { ContentType } from '@prisma/client';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

const validContentTypes = ['POST', 'REPOSITORY', 'REEL', 'STORY', 'SNIPPET', 'ACTIVITY'] as const;

const updateLikeCount = async (contentType: ContentType, contentId: string, delta: number) => {
  const update = { likesCount: { increment: delta } };
  switch (contentType) {
    case 'POST': return prisma.post.update({ where: { id: contentId }, data: update });
    case 'REEL': return prisma.reel.update({ where: { id: contentId }, data: update });
    case 'REPOSITORY': return prisma.repository.update({ where: { id: contentId }, data: { reactionsCount: { increment: delta } } });
    case 'ACTIVITY': return prisma.repositoryActivity.update({ where: { id: contentId }, data: update });
    default: return null;
  }
};

const updateCommentCount = async (contentType: ContentType, contentId: string, delta: number) => {
  const update = { commentsCount: { increment: delta } };
  switch (contentType) {
    case 'POST': return prisma.post.update({ where: { id: contentId }, data: update });
    case 'REEL': return prisma.reel.update({ where: { id: contentId }, data: update });
    case 'REPOSITORY': return prisma.repository.update({ where: { id: contentId }, data: update });
    case 'ACTIVITY': return prisma.repositoryActivity.update({ where: { id: contentId }, data: update });
    default: return null;
  }
};

export const toggleLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentType, contentId } = req.params;
  const userId = req.userId!;

  if (!validContentTypes.includes(contentType as any)) {
    throw Errors.badRequest('Invalid content type');
  }

  const existing = await prisma.interaction.findFirst({
    where: { userId, contentType: contentType as ContentType, contentId, type: 'like' }
  });

  if (existing) {
    await prisma.interaction.delete({ where: { id: existing.id } });
    await updateLikeCount(contentType as ContentType, contentId, -1);
    return res.json({ liked: false });
  }

  await prisma.interaction.create({
    data: { userId, contentType: contentType as ContentType, contentId, type: 'like' }
  });
  await updateLikeCount(contentType as ContentType, contentId, 1);
  res.json({ liked: true });
});

export const toggleSave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentType, contentId } = req.params;
  const userId = req.userId!;

  const existing = await prisma.interaction.findFirst({
    where: { userId, contentType: contentType as ContentType, contentId, type: 'save' }
  });

  if (existing) {
    await prisma.interaction.delete({ where: { id: existing.id } });
    return res.json({ saved: false });
  }

  await prisma.interaction.create({
    data: { userId, contentType: contentType as ContentType, contentId, type: 'save' }
  });
  res.json({ saved: true });
});

export const addComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentType, contentId } = req.params;
  const { content, parentId } = req.body;
  const userId = req.userId!;

  const comment = await prisma.unifiedComment.create({
    data: { userId, contentType: contentType as ContentType, contentId, content, parentId },
    include: { user: { select: { id: true, username: true, avatar: true } } }
  });

  await updateCommentCount(contentType as ContentType, contentId, 1);
  res.status(201).json(comment);
});

export const getComments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentType, contentId } = req.params;
  const { page = '1', limit = '20' } = req.query;

  const comments = await prisma.unifiedComment.findMany({
    where: { contentType: contentType as ContentType, contentId, parentId: null },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      replies: {
        take: 3,
        include: { user: { select: { id: true, username: true, avatar: true } } }
      },
      _count: { select: { replies: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
    skip: (Number(page) - 1) * Number(limit)
  });

  res.json(comments);
});

export const getInteractionStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentType, contentId } = req.params;
  const userId = req.userId!;

  const interactions = await prisma.interaction.findMany({
    where: { userId, contentType: contentType as ContentType, contentId }
  });

  res.json({
    liked: interactions.some(i => i.type === 'like'),
    saved: interactions.some(i => i.type === 'save')
  });
});
