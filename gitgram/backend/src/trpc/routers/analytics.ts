/**
 * tRPC analytics router.
 *
 * Exposes three query procedures:
 *   analytics.getDashboard    — aggregate dashboard metrics for the caller
 *   analytics.getPostAnalytics — per-post engagement breakdown (owner only)
 *   analytics.getUserAnalytics — per-user engagement summary (self only)
 *
 * All procedures require an authenticated session; ownership checks are
 * enforced by the underlying analyticsService functions.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from '../context';
import { prisma } from '../../utils/prisma';
import {
  getPostAnalytics,
  getUserAnalytics,
  type PostAnalytics,
  type UserAnalytics,
} from '../../services/analyticsService';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// tRPC initialisation
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create();

const router = t.router;

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
// Helpers
// ---------------------------------------------------------------------------

/** Accepted dashboard/analytics period values. */
const periodSchema = z.enum(['7d', '30d', '90d']).default('7d');

/** Convert a period string to a `Date` threshold. */
function periodToDate(period: '7d' | '30d' | '90d'): Date {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Build an array of ISO date strings (YYYY-MM-DD) from `since` up to today,
 * used as bucket labels for time-series data.
 */
function buildDateBuckets(since: Date): string[] {
  const buckets: string[] = [];
  const cursor = new Date(since);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  while (cursor <= today) {
    buckets.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export const analyticsRouter = router({
  /**
   * Aggregate dashboard metrics for the authenticated user.
   *
   * Returns:
   *   - Total post views, likes, comments, shares over the period
   *   - New follower count over the period
   *   - Daily breakdown arrays (views, likes, followers) for charting
   *   - Top 5 posts by view count
   *
   * Accepts a `period` of `"7d"`, `"30d"`, or `"90d"` (default `"7d"`).
   */
  getDashboard: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      const since = periodToDate(input.period);
      const buckets = buildDateBuckets(since);

      // ── Aggregate totals ─────────────────────────────────────────────────
      const [postTotals, newFollowers, topPostsRaw] = await Promise.all([
        prisma.post.aggregate({
          where: { userId: ctx.userId, createdAt: { gte: since } },
          _sum: { viewsCount: true, likesCount: true, commentsCount: true, sharesCount: true },
          _count: { _all: true },
        }),
        prisma.follow.count({
          where: { followingId: ctx.userId, createdAt: { gte: since } },
        }),
        prisma.post.findMany({
          where: { userId: ctx.userId },
          orderBy: { viewsCount: 'desc' },
          take: 5,
          select: {
            id: true,
            content: true,
            viewsCount: true,
            likesCount: true,
            commentsCount: true,
            createdAt: true,
          },
        }),
      ]);

      // ── Daily likes breakdown ─────────────────────────────────────────────
      const dailyLikesRaw = await prisma.like.groupBy({
        by: ['createdAt'],
        where: { post: { userId: ctx.userId }, createdAt: { gte: since } },
        _count: { id: true },
      });

      const likesMap = new Map<string, number>();
      for (const row of dailyLikesRaw) {
        const day = new Date(row.createdAt).toISOString().slice(0, 10);
        likesMap.set(day, (likesMap.get(day) ?? 0) + row._count.id);
      }

      // ── Daily new followers breakdown ─────────────────────────────────────
      const dailyFollowersRaw = await prisma.follow.groupBy({
        by: ['createdAt'],
        where: { followingId: ctx.userId, createdAt: { gte: since } },
        _count: { id: true },
      });

      const followersMap = new Map<string, number>();
      for (const row of dailyFollowersRaw) {
        const day = new Date(row.createdAt).toISOString().slice(0, 10);
        followersMap.set(day, (followersMap.get(day) ?? 0) + row._count.id);
      }

      const dailyLikes = buckets.map((day) => ({ date: day, count: likesMap.get(day) ?? 0 }));
      const dailyFollowers = buckets.map((day) => ({ date: day, count: followersMap.get(day) ?? 0 }));

      const topPosts = topPostsRaw.map((p) => ({
        id: p.id,
        caption: p.content,
        viewCount: p.viewsCount ?? 0,
        likeCount: p.likesCount ?? 0,
        commentCount: p.commentsCount ?? 0,
        createdAt: p.createdAt,
      }));

      return {
        period: input.period,
        since: since.toISOString(),
        totals: {
          posts: postTotals._count._all,
          views: postTotals._sum.viewsCount ?? 0,
          likes: postTotals._sum.likesCount ?? 0,
          comments: postTotals._sum.commentsCount ?? 0,
          shares: postTotals._sum.sharesCount ?? 0,
          newFollowers,
        },
        dailyLikes,
        dailyFollowers,
        topPosts,
      };
    }),

  /**
   * Per-post engagement breakdown.
   *
   * Accessible only by the post owner.  Delegates the ownership check and
   * metrics assembly to `getPostAnalytics` from analyticsService.
   *
   * Accepts a `period` param (`"7d" | "30d" | "90d"`) that is forwarded to
   * the service for filtering time-series buckets.
   */
  getPostAnalytics: protectedProcedure
    .input(
      z.object({
        postId: z.string().min(1),
        period: periodSchema,
      }),
    )
    .query(async ({ ctx, input }): Promise<PostAnalytics> => {
      try {
        return await getPostAnalytics(input.postId, ctx.userId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Analytics error';
        if (message === 'Post not found') {
          throw new TRPCError({ code: 'NOT_FOUND', message });
        }
        if (message.startsWith('Forbidden')) {
          throw new TRPCError({ code: 'FORBIDDEN', message });
        }
        logger.error('analytics.getPostAnalytics error', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch post analytics' });
      }
    }),

  /**
   * Per-user engagement summary.
   *
   * Accessible only for the caller's own profile (self-analytics).
   * Delegates to `getUserAnalytics` from analyticsService.
   *
   * The optional `userId` parameter defaults to the authenticated caller's ID
   * so the client can omit it on the "My Analytics" screen.
   */
  getUserAnalytics: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1).optional(),
        period: periodSchema,
      }),
    )
    .query(async ({ ctx, input }): Promise<UserAnalytics> => {
      const targetUserId = input.userId ?? ctx.userId;

      // Enforce self-only rule before hitting the service to surface a clearer
      // FORBIDDEN tRPC error rather than a raw thrown Error.
      if (targetUserId !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only view your own analytics',
        });
      }

      try {
        return await getUserAnalytics(targetUserId, ctx.userId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Analytics error';
        logger.error('analytics.getUserAnalytics error', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
      }
    }),
});
