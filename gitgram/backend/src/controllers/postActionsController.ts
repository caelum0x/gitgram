import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Save a post (optionally to one or more collections)
export const savePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { collectionIds } = req.body; // Optional array of collection IDs

  // Verify post exists
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw Errors.notFound('Post');
  }

  // Check if already saved
  const existingSavedPost = await prisma.savedPost.findUnique({
    where: { userId_postId: { userId, postId: id } },
  });

  let savedPost;
  if (existingSavedPost) {
    // Post already saved, just add to collections if specified
    savedPost = existingSavedPost;
  } else {
    // Create new saved post
    savedPost = await prisma.savedPost.create({
      data: { userId, postId: id },
    });
  }

  // If collection IDs provided, add to those collections
  if (collectionIds && Array.isArray(collectionIds) && collectionIds.length > 0) {
    // Verify all collections belong to user
    const collections = await prisma.savedCollection.findMany({
      where: { id: { in: collectionIds }, userId },
    });

    if (collections.length !== collectionIds.length) {
      throw Errors.badRequest('One or more collections not found');
    }

    // Add to collections via junction table
    await Promise.all(
      collectionIds.map((collectionId: string) =>
        prisma.savedPostCollection.upsert({
          where: {
            savedPostId_collectionId: {
              savedPostId: savedPost.id,
              collectionId,
            },
          },
          update: {},
          create: {
            savedPostId: savedPost.id,
            collectionId,
          },
        })
      )
    );

    // Update collections' updatedAt
    await prisma.savedCollection.updateMany({
      where: { id: { in: collectionIds } },
      data: { updatedAt: new Date() },
    });
  }

  // Get the saved post with its collections
  const result = await prisma.savedPost.findUnique({
    where: { id: savedPost.id },
    include: {
      collections: {
        include: {
          collection: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  res.json({
    message: 'Post saved',
    savedPost: {
      id: result?.id,
      savedAt: result?.savedAt,
      collections: result?.collections.map((c) => c.collection) || [],
    },
  });
});

// Unsave a post (removes from all collections too)
export const unsavePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const savedPost = await prisma.savedPost.findUnique({
    where: { userId_postId: { userId, postId: id } },
  });

  if (!savedPost) {
    throw Errors.notFound('Post not saved');
  }

  // Delete will cascade to SavedPostCollection entries
  await prisma.savedPost.delete({
    where: { userId_postId: { userId, postId: id } },
  });

  res.json({ message: 'Post unsaved' });
});

// Get all saved posts with collection info
export const getSavedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20, collectionId } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // If collectionId is provided, filter by that collection
  let whereClause: any = { userId };

  if (collectionId) {
    // Get saved posts that are in a specific collection
    const savedPostIds = await prisma.savedPostCollection.findMany({
      where: { collectionId: String(collectionId) },
      select: { savedPostId: true },
    });
    whereClause = {
      userId,
      id: { in: savedPostIds.map((sp) => sp.savedPostId) },
    };
  }

  const saved = await prisma.savedPost.findMany({
    where: whereClause,
    include: {
      post: {
        include: {
          user: {
            select: { id: true, username: true, avatar: true, verified: true },
          },
          _count: { select: { likes: true, comments: true } },
        },
      },
      collections: {
        include: {
          collection: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { savedAt: 'desc' },
    skip,
    take: Number(limit),
  });

  const total = await prisma.savedPost.count({ where: whereClause });

  res.json({
    posts: saved.map((s) => ({
      ...s.post,
      savedAt: s.savedAt,
      savedPostId: s.id,
      collections: s.collections.map((c) => c.collection),
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + saved.length < total,
    },
  });
});

// Check if a post is saved
export const isPostSaved = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const savedPost = await prisma.savedPost.findUnique({
    where: { userId_postId: { userId, postId: id } },
    include: {
      collections: {
        include: {
          collection: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  res.json({
    isSaved: !!savedPost,
    savedPost: savedPost
      ? {
          id: savedPost.id,
          savedAt: savedPost.savedAt,
          collections: savedPost.collections.map((c) => c.collection),
        }
      : null,
  });
});

export const sharePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.postShare.create({
    data: { userId: req.userId, postId: id },
  });

  await prisma.post.update({
    where: { id },
    data: { sharesCount: { increment: 1 } },
  });

  res.json({ message: 'Post shared' });
});

export const getPostShares = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const shares = await prisma.postShare.findMany({
    where: { postId: id },
    skip,
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  });

  res.json(shares);
});

export const reportPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { reason } = req.body;

  await prisma.postReport.create({
    data: { userId, postId: id, reason },
  });

  res.json({ message: 'Post reported' });
});

export const getArchivedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json([]);
});

export const likePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const account = await prisma.account.findFirst({ where: { userId: req.userId } });
  if (!account) throw Errors.notFound('Account');

  await prisma.$transaction([
    prisma.like.create({ data: { postId: id, accountId: account.id, userId: req.userId } }),
    prisma.post.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
    }),
  ]);

  res.json({ message: 'Post liked' });
});

export const unlikePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  await prisma.$transaction([
    prisma.like.delete({
      where: { postId_userId: { postId: id, userId } },
    }),
    prisma.post.update({
      where: { id },
      data: { likesCount: { decrement: 1 } },
    }),
  ]);

  res.json({ message: 'Post unliked' });
});

export const retweetPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.postShare.create({
    data: { userId: req.userId, postId: id },
  });

  await prisma.post.update({
    where: { id },
    data: { sharesCount: { increment: 1 } },
  });

  res.json({ message: 'Post retweeted' });
});
