import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { uploadPostImage } from '../services/storageService';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  avatar: true,
  verified: true,
} as const;

function serializeMoment(
  moment: {
    id: string;
    userId: string;
    screenshotUrl: string;
    selfieUrl: string;
    caption: string | null;
    location: string | null;
    likesCount: number;
    commentsCount: number;
    createdAt: Date;
  },
  author?: { id: string; username: string | null; avatar: string | null; verified: boolean } | null,
  isLiked = false,
) {
  return {
    id: moment.id,
    userId: moment.userId,
    screenshotUrl: moment.screenshotUrl,
    selfieUrl: moment.selfieUrl,
    caption: moment.caption ?? '',
    location: moment.location ?? '',
    likesCount: moment.likesCount,
    commentsCount: moment.commentsCount,
    createdAt: moment.createdAt,
    isLiked,
    user: author
      ? { id: author.id, username: author.username, avatar: author.avatar, verified: author.verified }
      : null,
  };
}

async function loadAuthors(userIds: string[]) {
  const unique = Array.from(new Set(userIds));
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: AUTHOR_SELECT,
  });
  return new Map(users.map((u) => [u.id, u]));
}

export const getMoments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const userId = req.query.userId ? String(req.query.userId) : undefined;

  const where = userId ? { userId } : {};

  const [moments, total] = await Promise.all([
    prisma.moment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.moment.count({ where }),
  ]);

  const authorMap = await loadAuthors(moments.map((m) => m.userId));

  let likedIds = new Set<string>();
  if (req.userId && moments.length > 0) {
    const likes = await prisma.momentLike.findMany({
      where: { userId: req.userId, momentId: { in: moments.map((m) => m.id) } },
      select: { momentId: true },
    });
    likedIds = new Set(likes.map((l) => l.momentId));
  }

  res.json({
    moments: moments.map((m) => serializeMoment(m, authorMap.get(m.userId), likedIds.has(m.id))),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export const getMoment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const moment = await prisma.moment.findUnique({ where: { id } });
  if (!moment) {
    throw Errors.notFound('Moment');
  }

  const authorMap = await loadAuthors([moment.userId]);
  let isLiked = false;
  if (req.userId) {
    const like = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: moment.id, userId: req.userId } },
    });
    isLiked = Boolean(like);
  }

  res.json({ moment: serializeMoment(moment, authorMap.get(moment.userId), isLiked) });
});

export const createMoment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const screenshotFile = files.screenshot?.[0];
  const selfieFile = files.selfie?.[0];

  if (!screenshotFile || !selfieFile) {
    throw Errors.badRequest('Both a screenshot and a selfie are required');
  }

  const [screenshot, selfie] = await Promise.all([
    uploadPostImage(screenshotFile, 'moments'),
    uploadPostImage(selfieFile, 'moments'),
  ]);

  const { caption, location } = req.body;

  const moment = await prisma.moment.create({
    data: {
      userId: req.userId!,
      screenshotUrl: screenshot.url,
      selfieUrl: selfie.url,
      caption: caption ? String(caption) : null,
      location: location ? String(location) : null,
    },
  });

  const authorMap = await loadAuthors([moment.userId]);
  res.status(201).json({ moment: serializeMoment(moment, authorMap.get(moment.userId), false) });
});

export const likeMoment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const moment = await prisma.moment.findUnique({ where: { id }, select: { id: true } });
  if (!moment) {
    throw Errors.notFound('Moment');
  }

  const existing = await prisma.momentLike.findUnique({
    where: { momentId_userId: { momentId: id, userId: req.userId! } },
  });

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.momentLike.delete({ where: { id: existing.id } }),
      prisma.moment.update({
        where: { id },
        data: { likesCount: { decrement: 1 } },
        select: { likesCount: true },
      }),
    ]);
    res.json({ isLiked: false, likesCount: Math.max(0, updated.likesCount) });
    return;
  }

  const [, updated] = await prisma.$transaction([
    prisma.momentLike.create({ data: { momentId: id, userId: req.userId! } }),
    prisma.moment.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    }),
  ]);
  res.json({ isLiked: true, likesCount: updated.likesCount });
});

export const getReactions = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const moment = await prisma.moment.findUnique({ where: { id }, select: { id: true } });
  if (!moment) {
    throw Errors.notFound('Moment');
  }

  const likes = await prisma.momentLike.findMany({
    where: { momentId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const userMap = await loadAuthors(likes.map((l) => l.userId));

  res.json({
    reactions: likes.map((l) => {
      const u = userMap.get(l.userId);
      return {
        id: l.id,
        userId: l.userId,
        createdAt: l.createdAt,
        user: u ? { id: u.id, username: u.username, avatar: u.avatar, verified: u.verified } : null,
      };
    }),
  });
});

export const deleteMoment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const moment = await prisma.moment.findUnique({ where: { id } });
  if (!moment) {
    throw Errors.notFound('Moment');
  }
  if (moment.userId !== req.userId) {
    throw Errors.forbidden('You can only delete your own moments');
  }

  await prisma.moment.delete({ where: { id } });
  res.json({ success: true });
});
