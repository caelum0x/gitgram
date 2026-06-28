import { Request, Response } from 'express';
import { PostType } from '@prisma/client';
import prisma from '../utils/prisma';
import FeedService from '../services/feedService';
import { AuthRequest } from '../middleware/auth';
import { repositoryService } from '../services/repositoryService';
import { processMentionsForPost, processMentionsForComment } from '../services/mentionService';
import { processLinkPreviewsForPost } from '../services/linkPreviewService';
import { blockService } from '../services/blockService';
import logger from '../utils/logger';
import { uploadMedia } from '../services/storageService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import { validateCheckpoint, buildCheckpointRef, formatCheckpointDescription } from '../services/aitmService';
import type { AitmCheckpointRef } from '../services/aitmService';
import { getCachedComments, setCachedComments, invalidateCommentCache } from '../utils/commentCache';
import { tuneFeed, type TunableFeedItem } from '../services/feedTuner';
import { normalizeSelfLabels, decideSelfLabel } from '../services/selfLabels';
import { computeMutedFeedFlags } from '../services/mutedWordsService';
import {
  computePreferredLanguageFlags,
  getPreferredLanguagesForUser,
} from '../services/languagePreferenceService';

export const createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    content,
    mediaUrls,
    repoUrl,
    repoOwner,
    repoName,
    type = 'POST',
    hashtags,
    checkpointId,
    fromCheckpointId,
    aitmProjectId,
    diffSummary,
    changedFiles,
    changeStoryTitle,
    selfLabels,
    contentWarning,
  } = req.body;
  const account = await prisma.account.findFirst({ where: { userId: req.userId } });
  if (!account) throw Errors.notFound('Account');

  let repositoryId = null;
  const normalizedContent = typeof content === 'string' ? content : '';
  const parsedRepo = (() => {
    if (!repoUrl || typeof repoUrl !== 'string') return null;
    const m = repoUrl.match(/github\.com\/([^\/]+)\/([^\/?#]+)/i);
    if (!m) return null;
    return { owner: m[1], name: m[2].replace(/\.git$/, '') };
  })();
  const effectiveRepoOwner = repoOwner || parsedRepo?.owner;
  const effectiveRepoName = repoName || parsedRepo?.name;

  if (effectiveRepoOwner && effectiveRepoName) {
    try {
      const repository = await repositoryService.getRepository(effectiveRepoOwner, effectiveRepoName);
      repositoryId = repository.id;
    } catch (error) {
      throw Errors.notFound('GitHub repository');
    }
  }

  const uploadedMediaUrl = req.file ? await uploadMedia(req.file, 'posts') : null;
  const normalizedMediaUrls = Array.isArray(mediaUrls) ? mediaUrls : [];
  if (uploadedMediaUrl) normalizedMediaUrls.unshift(uploadedMediaUrl);

  const parsedDiffSummary = (() => {
    if (!diffSummary) return null;
    if (typeof diffSummary === 'object') return diffSummary as Record<string, unknown>;
    if (typeof diffSummary === 'string') {
      try {
        return JSON.parse(diffSummary) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  })();
  const parsedChangedFiles = (() => {
    if (!changedFiles) return null;
    if (Array.isArray(changedFiles)) return changedFiles;
    if (typeof changedFiles === 'string') {
      try {
        const parsed = JSON.parse(changedFiles);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return changedFiles.split('\n').map((line: string) => line.trim()).filter(Boolean);
      }
    }
    return null;
  })();
  const changeStoryBlock = checkpointId ? [
    '',
    '[AITM_CHANGE_STORY]',
    `title=${changeStoryTitle || 'Repository Change Story'}`,
    `checkpointId=${checkpointId}`,
    `fromCheckpointId=${fromCheckpointId || ''}`,
    `aitmProjectId=${aitmProjectId || ''}`,
    `diffAdded=${Number(parsedDiffSummary?.added || 0)}`,
    `diffRemoved=${Number(parsedDiffSummary?.removed || 0)}`,
    `diffModified=${Number(parsedDiffSummary?.modified || 0)}`,
    `changedFiles=${JSON.stringify(parsedChangedFiles || [])}`,
    '[/AITM_CHANGE_STORY]',
  ].join('\n') : '';
  const finalContent = `${normalizedContent}${changeStoryBlock}`.trim();

  if (!finalContent && normalizedMediaUrls.length === 0) {
    throw Errors.badRequest('Content, checkpoint metadata, or media is required');
  }

  // Normalize the requested post type to the PostType enum (clients may send
  // lower/mixed case, e.g. "text"); fall back to POST for unknown values.
  const requestedType = typeof type === 'string' ? type.toUpperCase() : 'POST';
  const normalizedType: PostType = (Object.values(PostType) as string[]).includes(requestedType)
    ? (requestedType as PostType)
    : PostType.POST;
  const effectiveType: PostType = checkpointId ? PostType.CHANGE_STORY : normalizedType;

  // Author self-labeling / content warnings (voluntary sensitivity tags).
  const normalizedSelfLabels = normalizeSelfLabels(selfLabels);
  const normalizedContentWarning =
    typeof contentWarning === 'string' && contentWarning.trim().length > 0
      ? contentWarning.trim().slice(0, 300)
      : null;

  // Validate and resolve AITM checkpoint metadata (optional — allows post even if AITM is down)
  let resolvedAitmCheckpointRef: AitmCheckpointRef | null = null;
  const effectiveAitmCheckpointId = typeof checkpointId === 'string' && checkpointId.trim() ? checkpointId.trim() : null;
  const effectiveAitmProjectId = typeof aitmProjectId === 'string' && aitmProjectId.trim() ? aitmProjectId.trim() : null;

  if (effectiveAitmCheckpointId) {
    const meta = await validateCheckpoint(effectiveAitmCheckpointId, effectiveAitmProjectId ?? undefined);
    if (meta) {
      resolvedAitmCheckpointRef = buildCheckpointRef(meta);
    }
  }

  const post = await prisma.post.create({
    data: {
      accountId: account.id,
      userId: req.userId,
      content: finalContent,
      mediaUrls: normalizedMediaUrls,
      repoUrl,
      repositoryId,
      checkpointRef: checkpointId || null,
      aitmCheckpointId: effectiveAitmCheckpointId,
      aitmProjectId: effectiveAitmProjectId,
      aitmCheckpointRef: resolvedAitmCheckpointRef ?? undefined,
      type: effectiveType,
      selfLabels: normalizedSelfLabels,
      contentWarning: normalizedContentWarning,
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      repository: true
    }
  });

  // Handle hashtags
  const hashtagList = Array.isArray(hashtags)
    ? hashtags
    : typeof hashtags === 'string'
      ? hashtags.split(',').map((h: string) => h.trim()).filter(Boolean)
      : [];
  if (hashtagList.length) {
    await Promise.all(
      hashtagList.map(async (tag: string) => {
        const hashtag = await prisma.hashtag.upsert({
          where: { name: tag },
          create: { name: tag, count: 1 },
          update: { count: { increment: 1 } }
        });
        await prisma.postHashtag.create({
          data: { postId: post.id, hashtagId: hashtag.id }
        });
      })
    );
  }

  // Process @mentions and send notifications
  if (finalContent && post.user?.username) {
    try {
      await processMentionsForPost(
        finalContent,
        post.id,
        req.userId!,
        post.user.username
      );
    } catch (mentionError) {
      // Log but don't fail the post creation if mentions fail
      logger.error('Error processing mentions for post:', mentionError);
    }
  }

  // Process link previews for URLs in content (async, don't block response)
  let linkPreviews: any[] = [];
  if (finalContent) {
    try {
      linkPreviews = await processLinkPreviewsForPost(post.id, finalContent);
    } catch (linkError) {
      // Log but don't fail the post creation if link previews fail
      logger.error('Error processing link previews for post:', linkError);
    }
  }

  // Run auto-moderation pipeline (async, don't block response)
  try {
    const { runAutoModerationPipeline } = require('../services/moderationService');
    runAutoModerationPipeline('POST', post.id, req.userId!, finalContent).catch((modError: any) => {
      logger.error('Auto-moderation pipeline error for post:', modError);
    });
  } catch (modLoadError) {
    logger.warn('Auto-moderation service not available:', modLoadError);
  }

  res.status(201).json({ post: { ...post, linkPreviews } });
});

/**
 * Derive the thread-root key for a feed post.
 *
 * Gitgram posts are flat (no native reply chain), so the closest analog to a
 * Bluesky thread is an AITM change-story progression: a run of posts about the
 * same AITM project/checkpoint. Collapsing those keeps a busy change-story from
 * flooding the following feed, surfacing its highest-ranked entry once.
 *
 * We deliberately do NOT key on `repositoryId` alone — a repository can host
 * many distinct, unrelated posts, and collapsing all of them would regress the
 * general feed. Only the AITM-project subject is treated as a thread root.
 */
function deriveThreadRoot(post: Record<string, unknown>): string | null {
  const aitmProjectId = post.aitmProjectId;
  if (typeof aitmProjectId === 'string' && aitmProjectId.length > 0) {
    return `aitm:${aitmProjectId}`;
  }
  return null;
}

/** Map a raw feed post to the minimal shape required by FeedTuner. */
function toTunableItem(post: Record<string, unknown>): TunableFeedItem {
  const selfLabel = decideSelfLabel({
    selfLabels: (post.selfLabels as string[] | null | undefined) ?? null,
    contentWarning: (post.contentWarning as string | null | undefined) ?? null,
  });
  return {
    ...(post as TunableFeedItem),
    id: post.id as string,
    type: 'post',
    authorId: (post.userId as string | null) ?? null,
    rootPostId: deriveThreadRoot(post),
    // Attach the self-label decision so the client can blur 'warn' posts and so
    // the feed can drop 'hide' posts (see applySelfLabelBehavior).
    selfLabel,
    score: (post.likesCount as number ?? 0) * 2 + (post.commentsCount as number ?? 0) * 3,
    likesCount: post.likesCount as number | undefined,
    commentsCount: post.commentsCount as number | undefined,
    sharesCount: post.sharesCount as number | undefined,
    createdAt: post.createdAt as Date | string | undefined,
    contentLanguage: (post.contentLanguage as string | null | undefined) ?? null,
  };
}

/**
 * Apply author self-label hide/warn behavior to a tuned feed.
 *
 * `hide` items (adult content) are removed unless the viewer is the author or
 * has opted into adult content. `warn` items stay in the feed carrying their
 * `selfLabel` decision so the client can blur them behind the warning.
 */
function applySelfLabelBehavior(
  items: TunableFeedItem[],
  opts: { viewerId: string; adultContentEnabled: boolean }
): TunableFeedItem[] {
  return items.filter(item => {
    const decision = item.selfLabel as ReturnType<typeof decideSelfLabel> | undefined;
    if (!decision || decision.behavior !== 'hide') return true;
    // Always show the author their own labeled post.
    if (item.authorId && item.authorId === opts.viewerId) return true;
    return opts.adultContentEnabled;
  });
}

/**
 * Mark each feed item with `isMutedWord` so `tuneFeed`'s removeMutedWords step
 * drops posts matching the viewer's muted words/tags (Bluesky `hasMutedWord`
 * parity for the feed read path). Returns a new array; inputs are not mutated.
 */
async function applyMutedWords(
  items: TunableFeedItem[],
  viewerId: string
): Promise<TunableFeedItem[]> {
  if (items.length === 0) return items;

  const flags = await computeMutedFeedFlags(
    viewerId,
    items.map(item => ({
      id: item.id,
      text: typeof item.content === 'string' ? item.content : '',
      authorId: item.authorId,
    }))
  );

  return items.map(item =>
    flags.get(item.id) ? { ...item, isMutedWord: true } : item
  );
}

/**
 * Mark each feed item with `isPreferredLanguage` so `tuneFeed`'s
 * `preferredLangOnly` step can keep only posts in the viewer's preferred
 * natural languages (Bluesky `FeedTuner.preferredLangOnly` parity). The tuner's
 * never-empty-page fallback ensures the feed never goes blank.
 *
 * Returns the (possibly unchanged) items plus a `preferredLangOnly` flag telling
 * the caller whether the viewer has any natural-language preference at all; when
 * false the tuner step is left disabled (a no-op for the largely-English
 * audience) and no per-item flags are computed.
 */
async function applyPreferredLanguage(
  items: TunableFeedItem[],
  viewerId: string
): Promise<{ items: TunableFeedItem[]; preferredLangOnly: boolean }> {
  if (items.length === 0) {
    return { items, preferredLangOnly: false };
  }

  const preferred = await getPreferredLanguagesForUser(viewerId);
  if (preferred.size === 0) {
    // Viewer expressed no natural-language preference: skip filtering entirely.
    return { items, preferredLangOnly: false };
  }

  const flags = await computePreferredLanguageFlags(
    viewerId,
    items.map(item => ({
      id: item.id,
      contentLanguage:
        typeof item.contentLanguage === 'string' ? item.contentLanguage : null,
    }))
  );

  const marked = items.map(item =>
    flags.get(item.id) === false
      ? { ...item, isPreferredLanguage: false }
      : { ...item, isPreferredLanguage: true }
  );

  return { items: marked, preferredLangOnly: true };
}

export const getFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20, cursor } = req.query;

  // Viewer's opt-in for author-self-labeled adult content (default: hidden).
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { adultContentEnabled: true },
  });
  const adultContentEnabled = viewer?.adultContentEnabled ?? false;
  const labelOpts = { viewerId: userId, adultContentEnabled };

  if (typeof cursor === 'string' && cursor.trim()) {
    const result = await FeedService.getPersonalizedFeedCursor(
      userId,
      cursor.trim(),
      Number(limit)
    );
    const mutedCursorItems = await applyMutedWords(
      (result.posts as Record<string, unknown>[]).map(toTunableItem),
      userId
    );
    const { items: markedCursorItems, preferredLangOnly: cursorLangOnly } =
      await applyPreferredLanguage(mutedCursorItems, userId);
    const tunedPosts = applySelfLabelBehavior(
      tuneFeed(markedCursorItems, { preferredLangOnly: cursorLangOnly }),
      labelOpts
    );
    res.json({ ...result, posts: tunedPosts });
    return;
  }

  // First page: try following feed, fall back to explore if empty (Bluesky HomeFeedAPI pattern)
  const posts = await FeedService.getPersonalizedFeed(
    userId,
    Number(page),
    Number(limit)
  );

  if (Array.isArray(posts) && posts.length === 0 && Number(page) === 1) {
    const explore = await FeedService.getExploreFeed(userId, 1, Number(limit));
    res.json({ posts: explore, isDiscover: true });
    return;
  }

  const mutedItems = await applyMutedWords(
    (posts as Record<string, unknown>[]).map(toTunableItem),
    userId
  );
  const { items: markedItems, preferredLangOnly } =
    await applyPreferredLanguage(mutedItems, userId);
  const tunedPosts = applySelfLabelBehavior(
    tuneFeed(markedItems, { preferredLangOnly }),
    labelOpts
  );

  res.json({ posts: tunedPosts, isDiscover: false });
});

export const getUnifiedFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20 } = req.query;

  const items = await FeedService.getUnifiedFeed(userId, Number(page), Number(limit));
  res.json(items);
});

export const getExploreFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20 } = req.query;

  const posts = await FeedService.getExploreFeed(
    userId,
    Number(page),
    Number(limit)
  );

  res.json(posts);
});

export const getTrending = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;
  const posts = await FeedService.getTrendingPosts(Number(limit));
  res.json(posts);
});

export const getPosts = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const posts = await prisma.post.findMany({
    where: {
      isArchived: false
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  const total = await prisma.post.count({
    where: {
      isArchived: false
    }
  });

  res.json({
    posts,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + posts.length < total
    }
  });
});

export const searchPosts = asyncHandler(async (req: Request, res: Response) => {
  const { q, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const posts = await prisma.post.findMany({
    where: {
      content: {
        contains: q as string,
        mode: 'insensitive'
      },
      isArchived: false
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  const total = await prisma.post.count({
    where: {
      content: {
        contains: q as string,
        mode: 'insensitive'
      },
      isArchived: false
    }
  });

  res.json({
    posts,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + posts.length < total
    }
  });
});

export const getTaggedPosts = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const posts = await prisma.post.findMany({
    where: {
      content: {
        contains: `@${userId}`,
        mode: 'insensitive'
      },
      isArchived: false
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  res.json(posts);
});

export const getPostLikes = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const likes = await prisma.like.findMany({
    where: { postId: id },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  res.json(likes.map(like => like.user));
});

export const getPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const currentUserId = req.userId;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true }
      },
      comments: {
        include: {
          user: {
            select: { id: true, username: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      linkPreviews: {
        select: {
          url: true,
          title: true,
          description: true,
          image: true,
          siteName: true,
          favicon: true,
          domain: true
        }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    }
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  // If post is archived, only the owner can view it via direct link
  if (post.isArchived && post.userId !== currentUserId) {
    throw Errors.notFound('Post');
  }

  // Check if there's a block relationship between current user and post author
  if (currentUserId && post.userId && currentUserId !== post.userId) {
    const hasBlock = await blockService.hasBlockRelationship(currentUserId, post.userId);
    if (hasBlock) {
      throw Errors.notFound('Post');
    }
  }

  // Increment view count
  await prisma.post.update({
    where: { id },
    data: { viewsCount: { increment: 1 } }
  });

  res.json({ post });
});

export const likePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { userId: true }
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  const existingLike = await prisma.like.findUnique({
    where: {
      postId_userId: { postId: id, userId }
    }
  });

  if (existingLike) {
    throw Errors.badRequest('Already liked');
  }

  const account = await prisma.account.findFirst({ where: { userId } });
  if (!account) throw Errors.notFound('Account');

  const [, updatedPost] = await prisma.$transaction([
    prisma.like.create({
      data: { postId: id, accountId: account.id, userId }
    }),
    prisma.post.update({
      where: { id },
      data: { likesCount: { increment: 1 } }
    })
  ]);

  // Create notification
  if (post && post.userId !== userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });
    if (user) {
      const { createLikeNotification } = await import('../services/notificationService');
      await createLikeNotification(post.userId!, userId, user.username!, id);
    }
  }

  res.json({ message: 'Post liked', liked: true, likesCount: updatedPost.likesCount });
});

export const unlikePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const existingLike = await prisma.like.findUnique({
    where: {
      postId_userId: { postId: id, userId }
    }
  });

  if (!existingLike) {
    throw Errors.badRequest('Post is not liked');
  }

  const [, updatedPost] = await prisma.$transaction([
    prisma.like.delete({
      where: {
        postId_userId: { postId: id, userId }
      }
    }),
    prisma.post.update({
      where: { id },
      data: { likesCount: { decrement: 1 } }
    })
  ]);

  res.json({ message: 'Post unliked', liked: false, likesCount: Math.max(0, updatedPost.likesCount) });
});

export const deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.post.findUnique({ where: { id } });

  if (!post) {
    throw Errors.notFound('Post');
  }

  if (post.userId !== userId) {
    throw Errors.forbidden('Unauthorized');
  }

  await prisma.post.delete({ where: { id } });

  res.json({ message: 'Post deleted' });
});

export const addComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.userId!;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { userId: true }
  });

  const account = await prisma.account.findFirst({ where: { userId } });
  if (!account) throw Errors.notFound('Account');

  const comment = await prisma.comment.create({
    data: {
      postId: id,
      accountId: account.id,
      userId,
      content
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  await prisma.post.update({
    where: { id },
    data: { commentsCount: { increment: 1 } }
  });

  // Create notification for post owner
  if (post && post.userId !== userId) {
    const { createCommentNotification } = await import('../services/notificationService');
    await createCommentNotification(post.userId!, userId, comment.user!.username!, id);
  }

  // Process @mentions in the comment and send notifications
  if (content && comment.user?.username) {
    try {
      await processMentionsForComment(
        content,
        id,
        comment.id,
        userId,
        comment.user.username
      );
    } catch (mentionError) {
      // Log but don't fail the comment creation if mentions fail
      logger.error('Error processing mentions for comment:', mentionError);
    }
  }

  // Run auto-moderation pipeline on comment (async, don't block response)
  try {
    const { runAutoModerationPipeline } = require('../services/moderationService');
    runAutoModerationPipeline('COMMENT', comment.id, userId, content).catch((modError: any) => {
      logger.error('Auto-moderation pipeline error for comment:', modError);
    });
  } catch (modLoadError) {
    logger.warn('Auto-moderation service not available:', modLoadError);
  }

  // Invalidate cached comments for this post
  await invalidateCommentCache(id);

  res.status(201).json({ comment });
});

export const getComments = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Only cache the first page with default limit to keep the key simple
  const isFirstPage = Number(page) === 1 && Number(limit) === 20;
  if (isFirstPage) {
    const cached = await getCachedComments(id);
    if (cached) {
      res.json(cached);
      return;
    }
  }

  const comments = await prisma.comment.findMany({
    where: { postId: id },
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  const total = await prisma.comment.count({ where: { postId: id } });

  const responseBody = {
    comments,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + comments.length < total
    }
  };

  if (isFirstPage) {
    await setCachedComments(id, responseBody);
  }

  res.json(responseBody);
});

// ---------------------------------------------------------------------------
// POST /v1/posts/from-checkpoint — create a post from an AITM checkpoint
// ---------------------------------------------------------------------------

export const createPostFromCheckpoint = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { checkpointId, projectId, message, visibility } = req.body;

  // Input validation
  if (!checkpointId || typeof checkpointId !== 'string' || !checkpointId.trim()) {
    throw Errors.missingField('checkpointId');
  }
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    throw Errors.missingField('projectId');
  }
  if (message !== undefined && typeof message !== 'string') {
    throw Errors.invalidField('message', 'message must be a string');
  }
  if (visibility !== undefined && !['public', 'followers', 'private'].includes(visibility)) {
    throw Errors.invalidField('visibility', 'visibility must be one of: public, followers, private');
  }

  const account = await prisma.account.findFirst({ where: { userId: req.userId } });
  if (!account) throw Errors.notFound('Account');

  // Fetch checkpoint metadata from AITM API (optional — graceful degradation)
  const meta = await validateCheckpoint(checkpointId.trim(), projectId.trim());

  const checkpointRef: AitmCheckpointRef | null = meta ? buildCheckpointRef(meta) : null;
  const autoContent = meta
    ? formatCheckpointDescription(meta)
    : `Checkpoint ${checkpointId.slice(0, 8)}`;
  const finalContent = typeof message === 'string' && message.trim()
    ? message.trim()
    : autoContent;

  const post = await prisma.post.create({
    data: {
      accountId: account.id,
      userId: req.userId,
      content: finalContent,
      mediaUrls: [],
      type: 'CHANGE_STORY',
      aitmCheckpointId: checkpointId.trim(),
      aitmProjectId: projectId.trim(),
      aitmCheckpointRef: checkpointRef ?? undefined,
      checkpointRef: checkpointId.trim(),
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true },
      },
      repository: true,
    },
  });

  // Process @mentions if any (async, don't block)
  if (finalContent && post.user?.username) {
    try {
      await processMentionsForPost(finalContent, post.id, req.userId!, post.user.username);
    } catch (mentionError: unknown) {
      logger.error('Error processing mentions for checkpoint post:', mentionError);
    }
  }

  res.status(201).json({ post });
});
