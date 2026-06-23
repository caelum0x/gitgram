/**
 * tRPC notifications router.
 *
 * Provides cursor-paginated notification fetching with optional type
 * filtering, single/bulk mark-as-read mutations, unread count query,
 * and notification preference updates.
 *
 * All procedures require an authenticated session.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from '../context';
import { prisma } from '../../utils/prisma';
import {
  markNotificationsAsRead,
  getUnreadCount,
} from '../../services/notificationService';
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
// Zod schemas
// ---------------------------------------------------------------------------

/** All supported notification type values (mirrors the Prisma enum). */
const notificationTypeSchema = z.enum([
  'LIKE',
  'COMMENT',
  'FOLLOW',
  'MENTION',
  'MESSAGE',
  'REPO_UPDATE',
  'STORY_REPLY',
]);

/**
 * Shape of a single notification row returned to the client.
 *
 * Note: the Prisma `Notification` model stores `actorId` as a scalar (the
 * Account that triggered the notification) — there is no `actor` relation to
 * include, so we surface the raw `actorId` instead.
 */
const notificationSelectFields = {
  id: true,
  type: true,
  content: true,
  read: true,
  createdAt: true,
  postId: true,
  actorId: true,
} as const;

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export const notificationsRouter = router({
  /**
   * Cursor-paginated list of notifications for the authenticated user.
   * Results are ordered newest-first.
   *
   * Optional `type` filter narrows to a single notification category.
   * Pass the `cursor` from a previous response to retrieve the next page.
   */
  getNotifications: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        type: notificationTypeSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.userId,
        ...(input.type ? { type: input.type } : {}),
      };

      const notifications = await prisma.notification.findMany({
        where,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        select: notificationSelectFields,
      });

      let nextCursor: string | undefined;
      if (notifications.length > input.limit) {
        const extra = notifications.pop();
        nextCursor = extra?.id;
      }

      const unreadCount = await getUnreadCount(ctx.userId);

      return { items: notifications, nextCursor, unreadCount };
    }),

  /**
   * Mark a single notification as read.
   * Returns the updated notification record.
   * Throws `NOT_FOUND` when the notification does not belong to the caller.
   */
  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const notification = await prisma.notification.findUnique({
        where: { id: input.notificationId },
        select: { id: true, userId: true },
      });

      if (!notification || notification.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
      }

      const updated = await prisma.notification.update({
        where: { id: input.notificationId },
        data: { read: true },
        select: notificationSelectFields,
      });

      return updated;
    }),

  /**
   * Mark all unread notifications as read for the authenticated user.
   * Returns the number of notifications updated.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const count = await markNotificationsAsRead(ctx.userId);
      return { updatedCount: count };
    } catch (err: unknown) {
      logger.error('notifications.markAllRead error', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to mark notifications as read',
      });
    }
  }),

  /**
   * Returns the count of unread notifications for the authenticated user.
   * Lightweight query intended for badge/indicator polling.
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await getUnreadCount(ctx.userId);
    return { count };
  }),

  /**
   * Update notification preferences for the authenticated user.
   * Only the supplied fields are changed; omitted fields retain their current value.
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        likes: z.boolean().optional(),
        comments: z.boolean().optional(),
        follows: z.boolean().optional(),
        mentions: z.boolean().optional(),
        messages: z.boolean().optional(),
        posts: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        emailDigest: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Strip undefined values so Prisma only updates supplied fields
      const data = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ) as Record<string, boolean>;

      if (Object.keys(data).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No preference fields provided',
        });
      }

      const prefs = await prisma.notificationPreferences.upsert({
        where: { userId: ctx.userId },
        update: data,
        create: { userId: ctx.userId, ...data },
      });

      return prefs;
    }),
});
