import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getTrendingTags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { limit = 10 } = req.query;

  const tags = await prisma.hashtag.findMany({
    orderBy: { count: 'desc' },
    take: Number(limit)
  });

  res.json(tags);
});

export const searchTags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { q, limit = 20 } = req.query;

  const tags = await prisma.hashtag.findMany({
    where: {
      name: {
        contains: q as string,
        mode: 'insensitive'
      }
    },
    orderBy: { count: 'desc' },
    take: Number(limit)
  });

  res.json(tags);
});

export const getTagPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name } = req.params;
  const { cursor, limit = '20', sort = 'desc' } = req.query;
  const take = Math.min(parseInt(limit as string, 10) || 20, 50);
  const sortDir = sort === 'asc' ? 'asc' : 'desc';

  const hashtag = await prisma.hashtag.findUnique({ where: { name } });

  if (!hashtag) {
    throw Errors.notFound('Tag');
  }

  // Cache key for trending tags endpoint
  const postHashtags = await prisma.postHashtag.findMany({
    where: {
      hashtagId: hashtag.id,
      ...(cursor
        ? {
            post: {
              createdAt: sortDir === 'desc'
                ? { lt: new Date(cursor as string) }
                : { gt: new Date(cursor as string) },
            },
          }
        : {}),
    },
    include: {
      post: {
        include: {
          user: {
            select: { id: true, username: true, avatar: true, verified: true },
          },
        },
      },
    },
    orderBy: { post: { createdAt: sortDir } },
    take: take + 1,
  });

  const hasMore = postHashtags.length > take;
  const results = hasMore ? postHashtags.slice(0, take) : postHashtags;
  const posts = results.map((ph) => ph.post);
  const nextCursor =
    hasMore && posts.length > 0
      ? posts[posts.length - 1].createdAt.toISOString()
      : null;

  res.json({ hashtag, posts, nextCursor, hasMore: nextCursor !== null });
});
