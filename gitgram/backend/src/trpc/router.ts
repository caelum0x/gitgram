/**
 * Main tRPC application router.
 *
 * Organised into three sub-routers — posts, users, snippets — that mirror
 * the existing REST API surface while delegating to the same Prisma client
 * and services used by the REST handlers.
 *
 * Procedure naming follows the convention used by tRPC v11:
 *   posts.feed    → GET  /trpc/posts.feed
 *   posts.byId    → GET  /trpc/posts.byId
 *   posts.create  → POST /trpc/posts.create
 *   users.profile → GET  /trpc/users.profile
 *   users.follow  → POST /trpc/users.follow
 *   snippets.list → GET  /trpc/snippets.list
 *   snippets.create → POST /trpc/snippets.create
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context';
import FeedService from '../services/feedService';
import { prisma } from '../utils/prisma';
import { blockService } from '../services/blockService';
import { createFollowNotification } from '../services/notificationService';
import logger from '../utils/logger';
import { socialRouter } from './routers/social';
import { notificationsRouter } from './routers/notifications';
import { analyticsRouter } from './routers/analytics';

// ---------------------------------------------------------------------------
// tRPC initialisation
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create();

const router = t.router;
const publicProcedure = t.procedure;

/**
 * Protected middleware — resolves only when a valid session exists.
 * After this middleware runs, `ctx.userId` is guaranteed to be a `string`.
 */
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// ---------------------------------------------------------------------------
// Shared Zod schemas
// ---------------------------------------------------------------------------

const paginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Posts sub-router
// ---------------------------------------------------------------------------

/**
 * Shape returned by feed and byId queries.
 * Derived directly from the Prisma Post select so TypeScript can infer it.
 */
const postSelectFields = {
  id: true,
  content: true,
  mediaUrls: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  repositoryId: true,
  user: {
    select: {
      id: true,
      username: true,
      avatar: true,
      verified: true,
    },
  },
} as const;

const postsRouter = router({
  /**
   * Paginated, personalised feed for the authenticated user.
   * Delegates to `FeedService.getPersonalizedFeedCursor` — same path as
   * `GET /api/posts/feed?cursor=…`.
   */
  feed: protectedProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      return FeedService.getPersonalizedFeedCursor(
        ctx.userId,
        input.cursor,
        input.limit,
      );
    }),

  /**
   * Fetch a single post by its ID.
   * Visible to unauthenticated callers (public post content).
   */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const post = await prisma.post.findUnique({
        where: { id: input.id },
        select: postSelectFields,
      });

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      return post;
    }),

  /**
   * Create a new text post for the authenticated user.
   * Handles the non-multipart text path; file uploads continue through the
   * existing REST `POST /api/posts` endpoint.
   */
  create: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(5000),
        repositoryId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await prisma.account.findFirst({
        where: { userId: ctx.userId },
        select: { id: true },
      });

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }

      const post = await prisma.post.create({
        data: {
          content: input.content,
          mediaUrls: [],
          type: 'POST',
          userId: ctx.userId,
          accountId: account.id,
          ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
        },
        select: postSelectFields,
      });

      return post;
    }),
});

// ---------------------------------------------------------------------------
// Users sub-router
// ---------------------------------------------------------------------------

const usersRouter = router({
  /**
   * Public profile lookup by username.
   * Mirrors `GET /api/users/:username`.
   * Authenticated callers also receive `isFollowing`.
   */
  profile: publicProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { username: input.username },
        select: {
          id: true,
          username: true,
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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Hide users involved in a block relationship
      if (ctx.userId && ctx.userId !== user.id) {
        const blocked = await blockService.hasBlockRelationship(ctx.userId, user.id);
        if (blocked) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        }
      }

      const isFollowing =
        ctx.userId && ctx.userId !== user.id
          ? !!(await prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: ctx.userId,
                  followingId: user.id,
                },
              },
            }))
          : false;

      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        verified: user.verified,
        createdAt: user.createdAt,
        postsCount: user._count.posts,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        isFollowing,
      };
    }),

  /**
   * Toggle follow / unfollow.
   * Returns `{ following: boolean }` — same contract as
   * `POST /api/users/:id/follow`.
   */
  follow: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot follow yourself',
        });
      }

      const blocked = await blockService.hasBlockRelationship(ctx.userId, input.userId);
      if (blocked) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot follow this user' });
      }

      const existing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: ctx.userId,
            followingId: input.userId,
          },
        },
      });

      if (existing) {
        await prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId: ctx.userId,
              followingId: input.userId,
            },
          },
        });
        return { following: false };
      }

      await prisma.follow.create({
        data: { followerId: ctx.userId, followingId: input.userId },
      });

      // Fire-and-forget notification — does not block the response
      prisma.user
        .findUnique({ where: { id: ctx.userId }, select: { username: true } })
        .then((follower) => {
          if (follower?.username) {
            return createFollowNotification(input.userId, ctx.userId, follower.username);
          }
        })
        .catch((err: unknown) => {
          logger.error('tRPC users.follow: notification error', err);
        });

      return { following: true };
    }),
});

// ---------------------------------------------------------------------------
// Snippets sub-router
// ---------------------------------------------------------------------------

const snippetSelectFields = {
  id: true,
  title: true,
  description: true,
  code: true,
  language: true,
  likesCount: true,
  viewsCount: true,
  createdAt: true,
  updatedAt: true,
  repositoryId: true,
  user: {
    select: {
      id: true,
      username: true,
      avatar: true,
    },
  },
} as const;

const snippetsRouter = router({
  /**
   * Paginated list of code snippets with optional language filter.
   * Mirrors `GET /api/snippets?language=…&page=…`.
   */
  list: publicProcedure
    .input(
      z.object({
        language: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const where = input.language ? { language: input.language } : {};
      const skip = (input.page - 1) * input.limit;

      const [items, total] = await Promise.all([
        prisma.codeSnippet.findMany({
          where,
          select: snippetSelectFields,
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip,
        }),
        prisma.codeSnippet.count({ where }),
      ]);

      return {
        snippets: items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  /**
   * Create a new code snippet for the authenticated user.
   * Mirrors `POST /api/snippets`.
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        code: z.string().min(1),
        language: z.string().min(1).max(50),
        description: z.string().max(1000).optional(),
        repositoryId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const snippet = await prisma.codeSnippet.create({
        data: {
          userId: ctx.userId,
          title: input.title,
          code: input.code,
          language: input.language,
          ...(input.description ? { description: input.description } : {}),
          ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
        },
        select: snippetSelectFields,
      });

      return snippet;
    }),
});

// ---------------------------------------------------------------------------
// App router
// ---------------------------------------------------------------------------

export const appRouter = router({
  posts: postsRouter,
  users: usersRouter,
  snippets: snippetsRouter,
  social: socialRouter,
  notifications: notificationsRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
