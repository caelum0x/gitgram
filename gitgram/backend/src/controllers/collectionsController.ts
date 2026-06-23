import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Helper to ensure user has a default "All Saved" collection
const ensureDefaultCollection = async (userId: string, accountId: string) => {
  const defaultCollection = await prisma.savedCollection.findFirst({
    where: { userId, isDefault: true },
  });

  if (!defaultCollection) {
    return prisma.savedCollection.create({
      data: {
        userId,
        accountId,
        name: 'All Saved',
        description: 'All your saved posts',
        isPrivate: true,
        isDefault: true,
      },
    });
  }

  return defaultCollection;
};

// Create a new collection
export const createCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description, coverImage, isPrivate = true } = req.body;
  const userId = req.userId!;

  if (!name || name.trim() === '') {
    throw Errors.badRequest('Collection name is required');
  }

  // Reserved name check
  if (name.toLowerCase() === 'all saved') {
    throw Errors.badRequest('This collection name is reserved');
  }

  const account = await prisma.account.findFirst({ where: { userId } });
  if (!account) {
    throw Errors.notFound('Account');
  }

  // Check for duplicate name
  const existing = await prisma.savedCollection.findFirst({
    where: { userId, name },
  });
  if (existing) {
    throw Errors.conflict('A collection with this name already exists');
  }

  const collection = await prisma.savedCollection.create({
    data: {
      accountId: account.id,
      userId,
      name: name.trim(),
      description: description?.trim() || null,
      coverImage: coverImage || null,
      isPrivate,
      isDefault: false,
    },
  });

  res.status(201).json(collection);
});

// Get all user collections
export const getCollections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  // Ensure default collection exists
  const account = await prisma.account.findFirst({ where: { userId } });
  if (account) {
    await ensureDefaultCollection(userId, account.id);
  }

  // Get all saved posts count for "All Saved"
  const totalSavedCount = await prisma.savedPost.count({
    where: { userId },
  });

  const collections = await prisma.savedCollection.findMany({
    where: { userId },
    include: {
      posts: {
        include: {
          post: {
            include: {
              user: {
                select: { id: true, username: true, avatar: true, verified: true },
              },
            },
          },
        },
        take: 4, // Preview images
        orderBy: { savedAt: 'desc' },
      },
      _count: { select: { posts: true, savedPostLinks: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  // Transform response to include post count properly
  const transformedCollections = collections.map((collection) => ({
    ...collection,
    postCount: collection.isDefault ? totalSavedCount : collection._count.posts + collection._count.savedPostLinks,
    previewPosts: collection.posts.map((sp) => sp.post),
  }));

  res.json(transformedCollections);
});

// Get a single collection by ID
export const getCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const collection = await prisma.savedCollection.findFirst({
    where: { id, userId },
    include: {
      _count: { select: { posts: true, savedPostLinks: true } },
    },
  });

  if (!collection) {
    throw Errors.notFound('Collection');
  }

  res.json({
    ...collection,
    postCount: collection._count.posts + collection._count.savedPostLinks,
  });
});

// Get posts in a collection
export const getCollectionPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const collection = await prisma.savedCollection.findFirst({
    where: { id, userId },
  });

  if (!collection) {
    throw Errors.notFound('Collection');
  }

  // For default "All Saved" collection, get all saved posts
  if (collection.isDefault) {
    const savedPosts = await prisma.savedPost.findMany({
      where: { userId },
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

    const total = await prisma.savedPost.count({ where: { userId } });

    return res.json({
      collection,
      posts: savedPosts.map((sp) => ({
        ...sp.post,
        savedAt: sp.savedAt,
        savedPostId: sp.id,
        collections: sp.collections.map((c) => c.collection),
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        hasMore: skip + savedPosts.length < total,
      },
    });
  }

  // For regular collections, get posts linked to this collection
  // Get both from collectionId and from SavedPostCollection junction table
  const [directPosts, linkedPosts] = await Promise.all([
    prisma.savedPost.findMany({
      where: { userId, collectionId: id },
      include: {
        post: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true, verified: true },
            },
            _count: { select: { likes: true, comments: true } },
          },
        },
      },
      orderBy: { savedAt: 'desc' },
    }),
    prisma.savedPostCollection.findMany({
      where: { collectionId: id },
      include: {
        savedPost: {
          include: {
            post: {
              include: {
                user: {
                  select: { id: true, username: true, avatar: true, verified: true },
                },
                _count: { select: { likes: true, comments: true } },
              },
            },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    }),
  ]);

  // Combine and deduplicate
  const postMap = new Map();
  directPosts.forEach((sp) => {
    postMap.set(sp.postId, {
      ...sp.post,
      savedAt: sp.savedAt,
      savedPostId: sp.id,
    });
  });
  linkedPosts.forEach((lp) => {
    if (!postMap.has(lp.savedPost.postId)) {
      postMap.set(lp.savedPost.postId, {
        ...lp.savedPost.post,
        savedAt: lp.addedAt,
        savedPostId: lp.savedPost.id,
      });
    }
  });

  const allPosts = Array.from(postMap.values());
  const paginatedPosts = allPosts.slice(skip, skip + Number(limit));
  const total = allPosts.length;

  res.json({
    collection,
    posts: paginatedPosts,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + paginatedPosts.length < total,
    },
  });
});

// Update a collection
export const updateCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, description, coverImage, isPrivate } = req.body;
  const userId = req.userId!;

  // Check if collection exists and belongs to user
  const existingCollection = await prisma.savedCollection.findFirst({
    where: { id, userId },
  });

  if (!existingCollection) {
    throw Errors.notFound('Collection');
  }

  // Cannot rename default collection
  if (existingCollection.isDefault && name && name !== existingCollection.name) {
    throw Errors.badRequest('Cannot rename the default collection');
  }

  // Reserved name check
  if (name && name.toLowerCase() === 'all saved' && !existingCollection.isDefault) {
    throw Errors.badRequest('This collection name is reserved');
  }

  // Check for duplicate name if renaming
  if (name && name !== existingCollection.name) {
    const duplicate = await prisma.savedCollection.findFirst({
      where: { userId, name, NOT: { id } },
    });
    if (duplicate) {
      throw Errors.conflict('A collection with this name already exists');
    }
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (coverImage !== undefined) updateData.coverImage = coverImage || null;
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

  const updatedCollection = await prisma.savedCollection.update({
    where: { id },
    data: updateData,
  });

  res.json(updatedCollection);
});

// Delete a collection
export const deleteCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const collection = await prisma.savedCollection.findFirst({
    where: { id, userId },
  });

  if (!collection) {
    throw Errors.notFound('Collection');
  }

  // Cannot delete default collection
  if (collection.isDefault) {
    throw Errors.badRequest('Cannot delete the default collection');
  }

  // Delete the collection (cascade will handle SavedPostCollection links)
  // But we need to keep the SavedPost entries (just remove collectionId reference)
  await prisma.$transaction([
    // Clear collectionId from saved posts that reference this collection
    prisma.savedPost.updateMany({
      where: { collectionId: id },
      data: { collectionId: null },
    }),
    // Delete the collection (will cascade delete SavedPostCollection entries)
    prisma.savedCollection.delete({
      where: { id },
    }),
  ]);

  res.json({ message: 'Collection deleted successfully' });
});

// Add post to a collection
export const addToCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { postId } = req.body;
  const userId = req.userId!;

  if (!postId) {
    throw Errors.badRequest('Post ID is required');
  }

  // Verify collection ownership
  const collection = await prisma.savedCollection.findFirst({
    where: { id, userId },
  });

  if (!collection) {
    throw Errors.notFound('Collection');
  }

  // Verify post exists
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw Errors.notFound('Post');
  }

  // Ensure the post is saved first
  const savedPost = await prisma.savedPost.upsert({
    where: { userId_postId: { userId, postId } },
    update: {},
    create: { userId, postId },
  });

  // Add to collection via junction table (allows multiple collections)
  await prisma.savedPostCollection.upsert({
    where: {
      savedPostId_collectionId: {
        savedPostId: savedPost.id,
        collectionId: id,
      },
    },
    update: {},
    create: {
      savedPostId: savedPost.id,
      collectionId: id,
    },
  });

  // Update collection's updatedAt
  await prisma.savedCollection.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  res.json({ message: 'Post added to collection' });
});

// Remove post from a collection
export const removeFromCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, postId } = req.params;
  const userId = req.userId!;

  // Verify collection ownership
  const collection = await prisma.savedCollection.findFirst({
    where: { id, userId },
  });

  if (!collection) {
    throw Errors.notFound('Collection');
  }

  // Get the saved post
  const savedPost = await prisma.savedPost.findFirst({
    where: { userId, postId },
  });

  if (!savedPost) {
    throw Errors.notFound('Saved post');
  }

  // Remove from junction table
  await prisma.savedPostCollection.deleteMany({
    where: {
      savedPostId: savedPost.id,
      collectionId: id,
    },
  });

  // Also clear collectionId if it matches
  if (savedPost.collectionId === id) {
    await prisma.savedPost.update({
      where: { id: savedPost.id },
      data: { collectionId: null },
    });
  }

  res.json({ message: 'Post removed from collection' });
});

// Move saved post to a different collection
export const moveSavedPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // savedPost id
  const { fromCollectionId, toCollectionId } = req.body;
  const userId = req.userId!;

  if (!toCollectionId) {
    throw Errors.badRequest('Target collection ID is required');
  }

  // Verify saved post belongs to user
  const savedPost = await prisma.savedPost.findFirst({
    where: { id, userId },
  });

  if (!savedPost) {
    throw Errors.notFound('Saved post');
  }

  // Verify target collection belongs to user
  const targetCollection = await prisma.savedCollection.findFirst({
    where: { id: toCollectionId, userId },
  });

  if (!targetCollection) {
    throw Errors.notFound('Target collection');
  }

  // Remove from source collection if specified
  if (fromCollectionId) {
    await prisma.savedPostCollection.deleteMany({
      where: {
        savedPostId: savedPost.id,
        collectionId: fromCollectionId,
      },
    });
  }

  // Add to target collection
  await prisma.savedPostCollection.upsert({
    where: {
      savedPostId_collectionId: {
        savedPostId: savedPost.id,
        collectionId: toCollectionId,
      },
    },
    update: {},
    create: {
      savedPostId: savedPost.id,
      collectionId: toCollectionId,
    },
  });

  // Update target collection's updatedAt
  await prisma.savedCollection.update({
    where: { id: toCollectionId },
    data: { updatedAt: new Date() },
  });

  res.json({ message: 'Post moved to collection' });
});

// Get all saved posts (for "All Saved" view)
export const getAllSavedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { cursor, limit = '20' } = req.query;
  const take = Math.min(parseInt(limit as string, 10) || 20, 50);

  const savedPosts = await prisma.savedPost.findMany({
    where: {
      userId,
      ...(cursor ? { savedAt: { lt: new Date(cursor as string) } } : {}),
    },
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
          collection: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { savedAt: 'desc' },
    take: take + 1,
  });

  const hasMore = savedPosts.length > take;
  const results = hasMore ? savedPosts.slice(0, take) : savedPosts;
  const nextCursor = hasMore ? results[results.length - 1].savedAt.toISOString() : null;

  res.json({
    posts: results.map((sp) => ({
      ...sp.post,
      savedAt: sp.savedAt,
      savedPostId: sp.id,
      likesCount: sp.post._count.likes,
      commentsCount: sp.post._count.comments,
      collections: sp.collections.map((c) => c.collection),
    })),
    nextCursor,
    hasMore,
  });
});

// Check if post is saved
export const checkPostSaved = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;
  const userId = req.userId!;

  const savedPost = await prisma.savedPost.findFirst({
    where: { userId, postId },
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

// Add post to multiple collections at once
export const addToMultipleCollections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId, collectionIds } = req.body;
  const userId = req.userId!;

  if (!postId) {
    throw Errors.badRequest('Post ID is required');
  }

  if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
    throw Errors.badRequest('Collection IDs array is required');
  }

  // Verify post exists
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw Errors.notFound('Post');
  }

  // Verify all collections belong to user
  const collections = await prisma.savedCollection.findMany({
    where: { id: { in: collectionIds }, userId },
  });

  if (collections.length !== collectionIds.length) {
    throw Errors.badRequest('One or more collections not found or not owned by user');
  }

  // Ensure post is saved
  const savedPost = await prisma.savedPost.upsert({
    where: { userId_postId: { userId, postId } },
    update: {},
    create: { userId, postId },
  });

  // Add to all collections
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

  res.json({ message: `Post added to ${collectionIds.length} collection(s)` });
});
