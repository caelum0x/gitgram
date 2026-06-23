import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createFollowNotification } from '../services/notificationService';
import { uploadAvatarImage, deleteMedia } from '../services/storageService';
import { searchUsersForMention } from '../services/mentionService';
import { blockService } from '../services/blockService';
import { recordProfileVisit } from './profileVisitsController';
import { ProfileVisitSource } from '@prisma/client';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const targetUserId = !id || id === 'me' ? authReq.userId! : id;
  const currentUserId = authReq.userId;

  // Check if there's a block relationship between users (if not viewing own profile)
  if (currentUserId && currentUserId !== targetUserId) {
    const hasBlock = await blockService.hasBlockRelationship(currentUserId, targetUserId);
    if (hasBlock) {
      // Return 404 to not reveal that the user exists
      throw Errors.notFound('User');
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      bio: true,
      verified: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true,
        },
      },
    },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  // Check if current user follows this user
  const isFollowing = currentUserId && currentUserId !== targetUserId
    ? !!(await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      }))
    : false;

  // Track profile visit (non-blocking, don't await)
  // Get visit source from query param if provided
  const sourceParam = req.query.source as string | undefined;
  const validSources: ProfileVisitSource[] = [
    'SEARCH', 'POST', 'COMMENT', 'MENTION', 'SUGGESTION',
    'DIRECT', 'FOLLOWERS', 'FOLLOWING', 'REPOSITORY'
  ];
  const source: ProfileVisitSource = sourceParam && validSources.includes(sourceParam.toUpperCase() as ProfileVisitSource)
    ? (sourceParam.toUpperCase() as ProfileVisitSource)
    : 'DIRECT';

  // Only track if viewing someone else's profile (not self)
  if (id !== 'me' && currentUserId !== targetUserId) {
    // Fire and forget - don't block the response
    recordProfileVisit(currentUserId || null, targetUserId, source).catch((err) => {
      logger.error('Failed to record profile visit:', err);
    });
  }

  res.json({
    ...user,
    postsCount: user._count.posts,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    isFollowing,
  });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { username, bio, avatar, isPrivate } = req.body;

  let avatarUrl = avatar;
  if (req.file) {
    // Delete old avatar if exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    if (user?.avatar) {
      await deleteMedia(user.avatar);
    }
    // Upload with optimization
    const uploadResult = await uploadAvatarImage(req.file);
    avatarUrl = uploadResult.url;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(username && { username }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl && { avatar: avatarUrl }),
      ...(typeof isPrivate === 'boolean' && { isPrivate }),
    },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      bio: true,
      verified: true,
      isPrivate: true,
      createdAt: true,
    },
  });

  res.json({ user: updatedUser });
});

export const followUser = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const userId = authReq.userId!;

  if (id === userId) {
    throw Errors.badRequest('Cannot follow yourself');
  }

  // Check if there's a block relationship between users
  const hasBlock = await blockService.hasBlockRelationship(userId, id);
  if (hasBlock) {
    throw Errors.forbidden('Cannot follow this user');
  }

  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: userId,
        followingId: id,
      },
    },
  });

  if (existingFollow) {
    // Unfollow
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: id,
        },
      },
    });

    res.json({ following: false });
  } else {
    // Follow
    await prisma.follow.create({
      data: {
        followerId: userId,
        followingId: id,
      },
    });

    // Create notification
    const follower = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (follower) {
      const { createFollowNotification } = await import('../services/notificationService');
      await createFollowNotification(id, userId, follower.username!);
    }

    res.json({ following: true });
  }
});

export const getFollowers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const targetUserId = id === 'me' ? authReq.userId! : id;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: targetUserId },
      skip,
      take: Number(limit),
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            avatar: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followingId: targetUserId } }),
  ]);

  res.json({
    followers: follows.map(f => f.follower),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getFollowing = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const targetUserId = id === 'me' ? authReq.userId! : id;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: targetUserId },
      skip,
      take: Number(limit),
      include: {
        following: {
          select: {
            id: true,
            username: true,
            avatar: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.count({ where: { followerId: targetUserId } }),
  ]);

  res.json({
    following: follows.map(f => f.following),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  if (!q) {
    throw Errors.badRequest('Search query is required');
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: String(q), mode: 'insensitive' } },
          { email: { contains: String(q), mode: 'insensitive' } },
        ],
      },
      skip,
      take: Number(limit),
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
      },
    }),
    prisma.user.count({
      where: {
        OR: [
          { username: { contains: String(q), mode: 'insensitive' } },
          { email: { contains: String(q), mode: 'insensitive' } },
        ],
      },
    }),
  ]);

  res.json({
    users,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * Search users for mention autocomplete
 * GET /api/v1/users/mention-search?q=query
 * Returns users matching the query (username, displayName) - limited to 10 results
 */
export const mentionSearch = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    throw Errors.badRequest('Search query is required');
  }

  // Remove @ symbol if present at start
  const query = q.startsWith('@') ? q.slice(1) : q;

  if (query.length < 1) {
    return res.json({ users: [] });
  }

  const users = await searchUsersForMention(query, authReq.userId, 10);

  res.json({ users });
});

export const getTaggedPosts = asyncHandler(async (req: Request, res: Response) => {
  const { id: userId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Get posts where user is mentioned in mentions array
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        content: {
          contains: `@${userId}`,
          mode: 'insensitive'
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    }),
    prisma.post.count({
      where: {
        content: {
          contains: `@${userId}`,
          mode: 'insensitive'
        },
      },
    }),
  ]);

  res.json({
    posts,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Get users that the current user doesn't follow
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = following.map(f => f.followingId);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { notIn: [...followingIds, userId] },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        verified: true,
        _count: {
          select: {
            followers: true,
            posts: true,
          },
        },
      },
    }),
    prisma.user.count({
      where: {
        id: { notIn: [...followingIds, userId] },
      },
    }),
  ]);

  res.json({
    users: users.map((u: any) => ({
      ...u,
      followersCount: u._count.followers,
      postsCount: u._count.posts,
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { type = 'all', page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let activities: any[] = [];

  if (type === 'all' || type === 'posts') {
    const posts = await prisma.post.findMany({
      where: { userId },
      skip: type === 'all' ? 0 : skip,
      take: type === 'all' ? Number(limit) : Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });
    activities.push(...posts.map((p: any) => ({ type: 'post', ...p })));
  }

  if (type === 'all' || type === 'likes') {
    const likes = await prisma.like.findMany({
      where: { userId },
      skip: type === 'all' ? 0 : skip,
      take: type === 'all' ? Number(limit) : Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            mediaUrls: true,
          },
        },
      },
    });
    activities.push(...likes.map((l: any) => ({ type: 'like', ...l })));
  }

  if (type === 'all' || type === 'comments') {
    const comments = await prisma.comment.findMany({
      where: { userId },
      skip: type === 'all' ? 0 : skip,
      take: type === 'all' ? Number(limit) : Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        post: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });
    activities.push(...comments.map((c: any) => ({ type: 'comment', ...c })));
  }

  // Sort by createdAt and paginate
  activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const paginated = activities.slice(skip, skip + Number(limit));

  res.json({
    activities: paginated,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: activities.length,
      pages: Math.ceil(activities.length / Number(limit)),
    },
  });
});


export const switchAccount = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { linkedAccountId } = req.body;

  if (!linkedAccountId) {
    throw Errors.badRequest('Linked account ID is required');
  }

  // Verify the linked account belongs to this user
  const linkedAccount = await prisma.linkedAccount.findFirst({
    where: {
      id: linkedAccountId,
      userId,
    },
  });

  if (!linkedAccount) {
    throw Errors.notFound('Linked account');
  }

  // Return info about the switched account context
  res.json({
    message: 'Account context switched',
    activeAccount: {
      id: linkedAccount.id,
      provider: linkedAccount.provider,
      username: linkedAccount.username,
      avatar: linkedAccount.avatar,
    },
  });
});

export const linkAccount = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { provider, providerId, email, username, avatar } = req.body;

  if (!provider || !providerId) {
    throw Errors.badRequest('Provider and provider ID are required');
  }

  // Check if this provider account is already linked to another user
  const existingLink = await prisma.linkedAccount.findUnique({
    where: {
      provider_providerId: {
        provider,
        providerId,
      },
    },
  });

  if (existingLink) {
    if (existingLink.userId === userId) {
      throw Errors.badRequest('This account is already linked');
    }
    throw Errors.badRequest('This account is linked to another user');
  }

  // Create the linked account
  const linkedAccount = await prisma.linkedAccount.create({
    data: {
      userId,
      provider,
      providerId,
      email,
      username,
      avatar,
    },
  });

  res.status(201).json({
    message: 'Account linked successfully',
    linkedAccount: {
      id: linkedAccount.id,
      provider: linkedAccount.provider,
      username: linkedAccount.username,
      avatar: linkedAccount.avatar,
      createdAt: linkedAccount.createdAt,
    },
  });
});

export const unlinkAccount = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { linkedAccountId } = req.params;

  if (!linkedAccountId) {
    throw Errors.badRequest('Linked account ID is required');
  }

  // Verify the linked account belongs to this user
  const linkedAccount = await prisma.linkedAccount.findFirst({
    where: {
      id: linkedAccountId,
      userId,
    },
  });

  if (!linkedAccount) {
    throw Errors.notFound('Linked account');
  }

  // Delete the linked account
  await prisma.linkedAccount.delete({
    where: { id: linkedAccountId },
  });

  res.json({ message: 'Account unlinked successfully' });
});

export const getLinkedAccounts = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const linkedAccounts = await prisma.linkedAccount.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      providerId: true,
      email: true,
      username: true,
      avatar: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ accounts: linkedAccounts });
});

export const updateInterests = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { interests } = req.body;

  if (!interests || !Array.isArray(interests)) {
    throw Errors.badRequest('Interests must be an array');
  }

  // Validate interests are strings
  if (!interests.every((i: any) => typeof i === 'string')) {
    throw Errors.badRequest('All interests must be strings');
  }

  // Normalize interests (lowercase, trim, remove duplicates)
  const normalizedInterests = [...new Set(
    interests.map((i: string) => i.toLowerCase().trim()).filter(Boolean)
  )];

  // Limit to 20 interests max
  if (normalizedInterests.length > 20) {
    throw Errors.badRequest('Maximum 20 interests allowed');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { interests: normalizedInterests },
    select: {
      id: true,
      interests: true,
    },
  });

  res.json({
    message: 'Interests updated successfully',
    interests: updatedUser.interests,
  });
});

export const updateEmail = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { email } = req.body;

  if (!email) {
    throw Errors.badRequest('Email is required');
  }

  // Check if email is already taken
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser && existingUser.id !== userId) {
    throw Errors.badRequest('Email already in use');
  }

  // Update email (email verification should be handled separately)
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { email },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  res.json({
    message: 'Email updated. Please verify your new email address.',
    user: updatedUser,
  });
});

// Get user interests
export const getInterests = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { interests: true },
  });

  res.json({ interests: user?.interests || [] });
});

// Get suggested interests based on user activity
export const getSuggestedInterests = asyncHandler(async (req: Request, res: Response) => {
  // Get popular topics from repositories and posts
  const popularLanguages = await prisma.repository.groupBy({
    by: ['language'],
    where: { language: { not: null } },
    _count: { language: true },
    orderBy: { _count: { language: 'desc' } },
    take: 10,
  });

  const suggestions = popularLanguages
    .filter(l => l.language)
    .map(l => l.language as string);

  res.json({ suggestions });
});

// Schedule account deletion (30 day grace period)
export const scheduleAccountDeletion = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { password } = req.body;

  if (!password) {
    throw Errors.badRequest('Password is required');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, scheduledDeletion: true },
  });

  if (!user?.password) {
    throw Errors.badRequest('Account has no password set');
  }

  if (user.scheduledDeletion) {
    throw Errors.badRequest('Deletion already scheduled');
  }

  const bcrypt = require('bcryptjs');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw Errors.unauthorized('Invalid password');
  }

  const scheduledDeletion = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: { scheduledDeletion },
  });

  logger.info(`Account deletion scheduled for user ${userId}, deletion date: ${scheduledDeletion}`);

  res.json({
    message: 'Account scheduled for deletion in 30 days',
    scheduledDeletion,
  });
});

// Cancel scheduled account deletion
export const cancelAccountDeletion = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scheduledDeletion: true },
  });

  if (!user?.scheduledDeletion) {
    throw Errors.badRequest('No deletion scheduled for this account');
  }

  // Clear the scheduled deletion
  await prisma.user.update({
    where: { id: userId },
    data: { scheduledDeletion: null },
  });

  logger.info(`Account deletion cancelled for user ${userId}`);

  res.json({ message: 'Account deletion cancelled' });
});

// Get account deletion status
export const getAccountDeletionStatus = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scheduledDeletion: true },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  const scheduled = !!user.scheduledDeletion;
  const daysRemaining = scheduled && user.scheduledDeletion
    ? Math.max(0, Math.ceil((user.scheduledDeletion.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  res.json({
    scheduled,
    scheduledDeletion: user.scheduledDeletion,
    daysRemaining,
  });
});
