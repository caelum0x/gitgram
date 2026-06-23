import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { createNotification } from '../services/notificationService';
import { processMentionsForComment } from '../services/mentionService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import { invalidateCommentCache } from '../utils/commentCache';

/**
 * Like/unlike a comment
 * POST /api/v1/posts/:postId/comments/:commentId/like
 */
export const toggleCommentLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const userId = req.userId!;

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { user: { select: { id: true } } }
  });

  if (!comment) {
    throw Errors.notFound('Comment');
  }

  const existingLike = await prisma.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId } }
  });

  if (existingLike) {
    // Unlike
    await prisma.$transaction([
      prisma.commentLike.delete({ where: { id: existingLike.id } }),
      prisma.comment.update({
        where: { id: commentId },
        data: { likesCount: { decrement: 1 } }
      })
    ]);

    return res.json({ liked: false, likesCount: comment.likesCount - 1 });
  }

  // Like
  await prisma.$transaction([
    prisma.commentLike.create({ data: { commentId, userId } }),
    prisma.comment.update({
      where: { id: commentId },
      data: { likesCount: { increment: 1 } }
    })
  ]);

  // Notify comment author
  if (comment.userId && comment.userId !== userId) {
    const liker = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    await createNotification(
      comment.userId,
      'LIKE',
      `${liker?.username || 'Someone'} liked your comment`,
      userId,
      comment.postId
    );
  }

  res.json({ liked: true, likesCount: comment.likesCount + 1 });
});

/**
 * Update a comment
 * PUT /api/v1/posts/:postId/comments/:commentId
 */
export const updateComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const { content } = req.body;
  const userId = req.userId!;

  if (!content || content.trim().length === 0) {
    throw Errors.badRequest('Content is required');
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId }
  });

  if (!comment) {
    throw Errors.notFound('Comment');
  }

  if (comment.userId !== userId) {
    throw Errors.forbidden('Not authorized to edit this comment');
  }

  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: { content: content.trim() },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  res.json(updatedComment);
});

/**
 * Delete a comment
 * DELETE /api/v1/posts/:postId/comments/:commentId
 */
export const deleteComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId, commentId } = req.params;
  const userId = req.userId!;

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { select: { userId: true } } }
  });

  if (!comment) {
    throw Errors.notFound('Comment');
  }

  // Allow deletion by comment author or post author
  if (comment.userId !== userId && comment.post.userId !== userId) {
    throw Errors.forbidden('Not authorized to delete this comment');
  }

  await prisma.$transaction([
    prisma.commentLike.deleteMany({ where: { commentId } }),
    prisma.comment.delete({ where: { id: commentId } }),
    prisma.post.update({
      where: { id: postId },
      data: { commentsCount: { decrement: 1 } }
    })
  ]);

  // Invalidate cached comments for this post
  await invalidateCommentCache(postId);

  res.json({ message: 'Comment deleted successfully' });
});

/**
 * Get comment likes
 * GET /api/v1/posts/:postId/comments/:commentId/likes
 */
export const getCommentLikes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const { page = '1', limit = '20' } = req.query;

  const likes = await prisma.commentLike.findMany({
    where: { commentId },
    include: {
      comment: false
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  // Get user details for likes
  const userIds = likes.map(l => l.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatar: true }
  });

  const likesWithUsers = likes.map(like => ({
    ...like,
    user: users.find(u => u.id === like.userId)
  }));

  res.json({
    likes: likesWithUsers,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: likes.length === parseInt(limit as string)
    }
  });
});

/**
 * Reply to a comment
 * POST /api/v1/posts/:postId/comments/:commentId/reply
 */
export const replyToComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId, commentId } = req.params;
  const { content } = req.body;
  const userId = req.userId!;

  if (!content || content.trim().length === 0) {
    throw Errors.badRequest('Content is required');
  }

  // Verify parent comment exists and belongs to the post
  const parentComment = await prisma.comment.findFirst({
    where: { id: commentId, postId },
    include: { user: { select: { id: true } } }
  });

  if (!parentComment) {
    throw Errors.notFound('Parent comment');
  }

  // Get user account
  const account = await prisma.account.findFirst({ where: { userId } });
  if (!account) {
    throw Errors.notFound('Account');
  }

  // Create the reply
  const reply = await prisma.comment.create({
    data: {
      postId,
      accountId: account.id,
      userId,
      parentId: commentId,
      content: content.trim()
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      parent: {
        select: {
          id: true,
          user: {
            select: { id: true, username: true }
          }
        }
      }
    }
  });

  // Update comment count on post
  await prisma.post.update({
    where: { id: postId },
    data: { commentsCount: { increment: 1 } }
  });

  // Notify parent comment author
  if (parentComment.userId && parentComment.userId !== userId) {
    const replier = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    await createNotification(
      parentComment.userId,
      'COMMENT',
      `${replier?.username || 'Someone'} replied to your comment`,
      userId,
      postId
    );
  }

  // Process @mentions in the reply and send notifications
  if (content && reply.user?.username) {
    try {
      await processMentionsForComment(
        content.trim(),
        postId,
        reply.id,
        userId,
        reply.user.username
      );
    } catch (mentionError) {
      // Log but don't fail the reply creation if mentions fail
      logger.error('Error processing mentions for comment reply:', mentionError);
    }
  }

  res.status(201).json(reply);
});

/**
 * Get replies to a comment — cursor-based pagination.
 * GET /api/v1/posts/:postId/comments/:commentId/replies
 *
 * Query params:
 *   cursor  — createdAt ISO string from the last reply of the previous page
 *   limit   — max items per page (default 20, max 50)
 *
 * Cursor pagination adapted from munia (MIT) for Gitgram's Prisma+PG stack.
 */
export const getCommentReplies = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const { cursor, limit = '20' } = req.query;

  const take = Math.min(parseInt(limit as string, 10) || 20, 50);

  const replies = await prisma.comment.findMany({
    where: {
      parentId: commentId,
      ...(cursor
        ? { createdAt: { gt: new Date(cursor as string) } }
        : {}),
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      _count: {
        select: { likes: true, replies: true }
      }
    },
    orderBy: { createdAt: 'asc' },
    take,
  });

  const nextCursor =
    replies.length === take
      ? replies[replies.length - 1].createdAt.toISOString()
      : null;

  res.json({
    replies,
    nextCursor,
    hasMore: nextCursor !== null,
  });
});

/**
 * Pin/unpin a comment (post owner only)
 * POST /api/v1/posts/:postId/comments/:commentId/pin
 */
export const togglePinComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId, commentId } = req.params;
  const userId = req.userId!;

  // Verify post ownership
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true }
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  if (post.userId !== userId) {
    throw Errors.forbidden('Only the post owner can pin comments');
  }

  // Get the comment
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, postId }
  });

  if (!comment) {
    throw Errors.notFound('Comment');
  }

  // If pinning, unpin any existing pinned comment first
  if (!comment.isPinned) {
    await prisma.comment.updateMany({
      where: { postId, isPinned: true },
      data: { isPinned: false }
    });
  }

  // Toggle pin status
  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: { isPinned: !comment.isPinned },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  res.json({
    comment: updatedComment,
    pinned: updatedComment.isPinned,
    message: updatedComment.isPinned ? 'Comment pinned' : 'Comment unpinned'
  });
});

/**
 * Get pinned comment for a post
 * GET /api/v1/posts/:postId/comments/pinned
 */
export const getPinnedComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;

  const pinnedComment = await prisma.comment.findFirst({
    where: { postId, isPinned: true },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      _count: {
        select: { likes: true, replies: true }
      }
    }
  });

  res.json({ pinnedComment });
});
