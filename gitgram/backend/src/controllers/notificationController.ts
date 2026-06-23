import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  markNotificationsAsRead,
  getUnreadCount,
  groupNotifications,
  type RawNotification,
} from '../services/notificationService';
import { asyncHandler, Errors } from '../middleware/errorHandler';

const NOTIFICATION_TITLES: Record<string, string> = {
  LIKE: 'New Like',
  COMMENT: 'New Comment',
  FOLLOW: 'New Follower',
  MENTION: 'New Mention',
  MESSAGE: 'New Message',
  REPO_UPDATE: 'Repository Update',
  STORY_REPLY: 'Story Reply',
};

async function enrichNotifications(
  notifications: Array<{
    id: string;
    userId: string | null;
    type: string;
    actorId: string | null;
    postId: string | null;
    content: string;
    read: boolean;
    createdAt: Date;
  }>
) {
  const actorIds = Array.from(
    new Set(
      notifications
        .map((notification) => notification.actorId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  const postIds = Array.from(
    new Set(
      notifications
        .map((notification) => notification.postId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  const [actors, posts] = await Promise.all([
    actorIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, username: true, avatar: true, displayName: true },
        })
      : Promise.resolve([]),
    postIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, mediaUrls: true, content: true },
        })
      : Promise.resolve([]),
  ]);

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const postMap = new Map(posts.map((post) => [post.id, post]));

  return notifications.map((notification) => {
    const actor = notification.actorId ? actorMap.get(notification.actorId) : null;
    const post = notification.postId ? postMap.get(notification.postId) : null;

    return {
      ...notification,
      title: NOTIFICATION_TITLES[notification.type] || 'Notification',
      body: notification.content,
      user: actor
        ? {
            id: actor.id,
            username: actor.username,
            avatar: actor.avatar,
            displayName: actor.displayName,
          }
        : null,
      post: post
        ? {
            id: post.id,
            mediaUrl: post.mediaUrls[0] || null,
            content: post.content,
          }
        : null,
    };
  });
}

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20, unreadOnly = false } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { userId };
  if (unreadOnly === 'true') {
    where.read = false;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  const enrichedNotifications = await enrichNotifications(notifications);

  res.json({
    notifications: enrichedNotifications,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!notification) {
    throw Errors.notFound('Notification');
  }

  const [enriched] = await enrichNotifications([notification]);
  res.json({ notification: enriched });
});

export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { notificationIds } = req.body;

  const count = await markNotificationsAsRead(
    userId,
    notificationIds
  );

  res.json({
    message: 'Notifications marked as read',
    count,
  });
});

export const getUnreadNotificationCount = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const userId = req.userId!;
  const count = await getUnreadCount(userId);

  res.json({ count });
});

export const getGroupedNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { limit = 40 } = req.query;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  });

  const enriched = await enrichNotifications(notifications);

  // Map enriched format into RawNotification shape expected by groupNotifications
  const raw: RawNotification[] = enriched.map((n) => ({
    id: n.id,
    userId: n.userId ?? userId,
    type: n.type,
    content: n.body,
    actorId: n.user?.id ?? null,
    postId: n.post?.id ?? null,
    read: n.read,
    createdAt: n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt),
    actor: n.user ? { id: n.user.id, username: n.user.username ?? '', avatar: n.user.avatar ?? null } : null,
  }));

  const grouped = groupNotifications(raw).map((g) => ({
    id: g.notification.id,
    type: g.notification.type,
    groupedContent: g.groupedContent,
    read: g.notification.read,
    createdAt: g.notification.createdAt,
    actorCount: g.additional.length + 1,
    primaryActor: g.notification.actor ?? null,
    post: enriched.find((e) => e.id === g.notification.id)?.post ?? null,
    notificationIds: [g.notification.id, ...g.additional.map((a) => a.id)],
  }));

  res.json({ notifications: grouped, total: grouped.length });
});

export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  await prisma.notification.delete({
    where: {
      id,
      userId, // Ensure user owns the notification
    },
  });

  res.json({ message: 'Notification deleted' });
});
