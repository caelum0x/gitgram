/**
 * tRPC social router — follow/unfollow, follower/following lists,
 * suggested users, and user blocking.
 *
 * All procedures in this router require an authenticated session except
 * `follow.getFollowers` and `follow.getFollowing`, which are public so that
 * profile pages can display follower counts without requiring a login.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from '../context';
import { prisma } from '../../utils/prisma';
import { blockService } from '../../services/blockService';
import { getSuggestedUsers } from '../../services/socialGraphService';
import { createFollowNotification } from '../../services/notificationService';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// tRPC initialisation (local — shares the same context shape as router.ts)
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create();

const router = t.router;
const publicProcedure = t.procedure;

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

const cursorPaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Minimal user shape returned in list queries
const userSelectFields = {
  id: true,
  username: true,
  avatar: true,
  bio: true,
  verified: true,
  _count: {
    select: { followers: true, following: true },
  },
} as const;

// ---------------------------------------------------------------------------
// follow sub-router
// ---------------------------------------------------------------------------

const followRouter = router({
  /**
   * Follow a user.
   * Returns `{ following: true }`.
   * Sends a follow notification to the target user (fire-and-forget).
   */
  followUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot follow yourself',
        });
      }

      const target = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
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
        throw new TRPCError({ code: 'CONFLICT', message: 'Already following this user' });
      }

      await prisma.follow.create({
        data: { followerId: ctx.userId, followingId: input.userId },
      });

      prisma.user
        .findUnique({ where: { id: ctx.userId }, select: { username: true } })
        .then((follower) => {
          if (follower?.username) {
            return createFollowNotification(input.userId, ctx.userId, follower.username);
          }
        })
        .catch((err: unknown) => {
          logger.error('social.follow.followUser: notification error', err);
        });

      return { following: true };
    }),

  /**
   * Unfollow a user.
   * Returns `{ following: false }`.
   * No-ops gracefully when no follow relationship exists.
   */
  unfollowUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot unfollow yourself',
        });
      }

      await prisma.follow.deleteMany({
        where: { followerId: ctx.userId, followingId: input.userId },
      });

      return { following: false };
    }),

  /**
   * Paginated list of followers for a given user.
   * Authenticated callers also receive `isFollowing` on each result row.
   */
  getFollowers: publicProcedure
    .input(
      cursorPaginationInput.extend({
        userId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const follows = await prisma.follow.findMany({
        where: { followingId: input.userId },
        take: input.limit + 1,
        ...(input.cursor
          ? { cursor: { followerId_followingId: { followerId: input.cursor, followingId: input.userId } }, skip: 1 }
          : {}),
        orderBy: { createdAt: 'desc' },
        select: {
          follower: { select: userSelectFields },
        },
      });

      let nextCursor: string | undefined;
      if (follows.length > input.limit) {
        const extra = follows.pop();
        nextCursor = extra?.follower.id;
      }

      const items = await Promise.all(
        follows.map(async ({ follower }) => {
          const isFollowing =
            ctx.userId && ctx.userId !== follower.id
              ? !!(await prisma.follow.findUnique({
                  where: {
                    followerId_followingId: {
                      followerId: ctx.userId,
                      followingId: follower.id,
                    },
                  },
                }))
              : false;

          return {
            id: follower.id,
            username: follower.username,
            avatar: follower.avatar,
            bio: follower.bio,
            verified: follower.verified,
            followersCount: follower._count.followers,
            followingCount: follower._count.following,
            isFollowing,
          };
        }),
      );

      return { items, nextCursor };
    }),

  /**
   * Paginated list of accounts that a given user follows.
   */
  getFollowing: publicProcedure
    .input(
      cursorPaginationInput.extend({
        userId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const follows = await prisma.follow.findMany({
        where: { followerId: input.userId },
        take: input.limit + 1,
        ...(input.cursor
          ? { cursor: { followerId_followingId: { followerId: input.userId, followingId: input.cursor } }, skip: 1 }
          : {}),
        orderBy: { createdAt: 'desc' },
        select: {
          following: { select: userSelectFields },
        },
      });

      let nextCursor: string | undefined;
      if (follows.length > input.limit) {
        const extra = follows.pop();
        nextCursor = extra?.following.id;
      }

      const items = await Promise.all(
        follows.map(async ({ following }) => {
          const isFollowing =
            ctx.userId && ctx.userId !== following.id
              ? !!(await prisma.follow.findUnique({
                  where: {
                    followerId_followingId: {
                      followerId: ctx.userId,
                      followingId: following.id,
                    },
                  },
                }))
              : false;

          return {
            id: following.id,
            username: following.username,
            avatar: following.avatar,
            bio: following.bio,
            verified: following.verified,
            followersCount: following._count.followers,
            followingCount: following._count.following,
            isFollowing,
          };
        }),
      );

      return { items, nextCursor };
    }),

  /**
   * Friend-of-friend suggestions for the authenticated user.
   * Delegates to `getSuggestedUsers` from socialGraphService.
   */
  getSuggested: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const suggestions = await getSuggestedUsers(ctx.userId, input.limit);
      return { items: suggestions };
    }),
});

// ---------------------------------------------------------------------------
// block sub-router
// ---------------------------------------------------------------------------

const blockRouter = router({
  /**
   * Block a user.
   * Automatically removes any existing follow relationship in both directions
   * (handled inside `blockService.blockUser`).
   */
  blockUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot block yourself',
        });
      }

      try {
        await blockService.blockUser(ctx.userId, input.userId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to block user';
        if (message === 'User not found') {
          throw new TRPCError({ code: 'NOT_FOUND', message });
        }
        if (message === 'User is already blocked') {
          throw new TRPCError({ code: 'CONFLICT', message });
        }
        logger.error('social.block.blockUser error', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to block user' });
      }

      return { blocked: true };
    }),

  /**
   * Unblock a user.
   * Returns `{ blocked: false }` once the block is lifted.
   */
  unblockUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await prisma.userBlock.deleteMany({
        where: { blockerId: ctx.userId, blockedId: input.userId },
      });

      return { blocked: false };
    }),

  /**
   * Paginated list of users blocked by the authenticated user.
   */
  getBlocked: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // `UserBlock` stores only scalar `blockedId` (no relation), so fetch the
      // block rows first, then resolve the blocked users in a single follow-up
      // query and stitch them together preserving block order.
      const blocks = await prisma.userBlock.findMany({
        where: { blockerId: ctx.userId },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          blockedId: true,
          createdAt: true,
        },
      });

      let nextCursor: string | undefined;
      if (blocks.length > input.limit) {
        const extra = blocks.pop();
        nextCursor = extra?.id;
      }

      const blockedUsers = await prisma.user.findMany({
        where: { id: { in: blocks.map((b) => b.blockedId) } },
        select: {
          id: true,
          username: true,
          avatar: true,
          bio: true,
          verified: true,
        },
      });

      const userById = new Map(blockedUsers.map((u) => [u.id, u]));

      const items = blocks
        .map((block) => {
          const blocked = userById.get(block.blockedId);
          if (!blocked) {
            return null;
          }
          return { ...blocked, blockedAt: block.createdAt };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return { items, nextCursor };
    }),
});

// ---------------------------------------------------------------------------
// Merged social router
// ---------------------------------------------------------------------------

export const socialRouter = router({
  follow: followRouter,
  block: blockRouter,
});
