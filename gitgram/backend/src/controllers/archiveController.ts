import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// ============================================
// POST ARCHIVE FUNCTIONS
// ============================================

/**
 * Archive a post (hide from feeds without deleting)
 * POST /api/v1/posts/:id/archive
 */
export const archivePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { userId: true, isArchived: true }
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  if (post.userId !== userId) {
    throw Errors.forbidden('Not authorized to archive this post');
  }

  if (post.isArchived) {
    throw Errors.badRequest('Post is already archived');
  }

  const archivedPost = await prisma.post.update({
    where: { id },
    data: {
      isArchived: true,
      archivedAt: new Date()
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    }
  });

  logger.info(`Post archived: ${id} by user ${userId}`);
  res.json({
    message: 'Post archived successfully',
    post: archivedPost
  });
});

/**
 * Unarchive a post (restore to feeds)
 * POST /api/v1/posts/:id/unarchive
 */
export const unarchivePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { userId: true, isArchived: true }
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  if (post.userId !== userId) {
    throw Errors.forbidden('Not authorized to unarchive this post');
  }

  if (!post.isArchived) {
    throw Errors.badRequest('Post is not archived');
  }

  const unarchivedPost = await prisma.post.update({
    where: { id },
    data: {
      isArchived: false,
      archivedAt: null
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    }
  });

  logger.info(`Post unarchived: ${id} by user ${userId}`);
  res.json({
    message: 'Post unarchived successfully',
    post: unarchivedPost
  });
});

/**
 * Get user's archived posts
 * GET /api/v1/posts/archived
 */
export const getArchivedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = '1', limit = '20' } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        userId,
        isArchived: true
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, verified: true }
        },
        repository: {
          select: { id: true, fullName: true, owner: true, name: true }
        },
        linkPreviews: {
          select: {
            url: true,
            title: true,
            description: true,
            image: true,
            siteName: true,
            domain: true
          }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      },
      orderBy: { archivedAt: 'desc' },
      skip,
      take: parseInt(limit as string)
    }),
    prisma.post.count({
      where: {
        userId,
        isArchived: true
      }
    })
  ]);

  res.json({
    posts,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      hasMore: posts.length === parseInt(limit as string)
    }
  });
});

// ============================================
// REEL ARCHIVE FUNCTIONS
// ============================================

/**
 * Archive a reel (hide from feeds without deleting)
 * POST /api/v1/reels/:id/archive
 */
export const archiveReel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const reel = await prisma.reel.findUnique({
    where: { id },
    select: { userId: true, isArchived: true }
  });

  if (!reel) {
    throw Errors.notFound('Reel');
  }

  if (reel.userId !== userId) {
    throw Errors.forbidden('Not authorized to archive this reel');
  }

  if (reel.isArchived) {
    throw Errors.badRequest('Reel is already archived');
  }

  const archivedReel = await prisma.reel.update({
    where: { id },
    data: {
      isArchived: true,
      archivedAt: new Date()
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      repository: {
        select: { id: true, fullName: true, owner: true, name: true }
      },
      _count: {
        select: { likes: true, comments: true, views: true }
      }
    }
  });

  logger.info(`Reel archived: ${id} by user ${userId}`);
  res.json({
    message: 'Reel archived successfully',
    reel: archivedReel
  });
});

/**
 * Unarchive a reel (restore to feeds)
 * POST /api/v1/reels/:id/unarchive
 */
export const unarchiveReel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const reel = await prisma.reel.findUnique({
    where: { id },
    select: { userId: true, isArchived: true }
  });

  if (!reel) {
    throw Errors.notFound('Reel');
  }

  if (reel.userId !== userId) {
    throw Errors.forbidden('Not authorized to unarchive this reel');
  }

  if (!reel.isArchived) {
    throw Errors.badRequest('Reel is not archived');
  }

  const unarchivedReel = await prisma.reel.update({
    where: { id },
    data: {
      isArchived: false,
      archivedAt: null
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      repository: {
        select: { id: true, fullName: true, owner: true, name: true }
      },
      _count: {
        select: { likes: true, comments: true, views: true }
      }
    }
  });

  logger.info(`Reel unarchived: ${id} by user ${userId}`);
  res.json({
    message: 'Reel unarchived successfully',
    reel: unarchivedReel
  });
});

/**
 * Get user's archived reels
 * GET /api/v1/reels/archived
 */
export const getArchivedReels = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = '1', limit = '20' } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [reels, total] = await Promise.all([
    prisma.reel.findMany({
      where: {
        userId,
        isArchived: true
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true }
        },
        repository: {
          select: { id: true, fullName: true, owner: true, name: true }
        },
        _count: {
          select: { likes: true, comments: true, views: true }
        }
      },
      orderBy: { archivedAt: 'desc' },
      skip,
      take: parseInt(limit as string)
    }),
    prisma.reel.count({
      where: {
        userId,
        isArchived: true
      }
    })
  ]);

  res.json({
    reels,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      hasMore: reels.length === parseInt(limit as string)
    }
  });
});
