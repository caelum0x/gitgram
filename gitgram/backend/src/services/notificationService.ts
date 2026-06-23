import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { emitToUser, isUserOnline } from '../websocket/socket';
import { sendPushNotificationToUser } from './pushService';
import dispatcher from './notifications/NotificationDispatcher';
import type { NotificationType as AdapterNotificationType } from './notifications/NotificationAdapter';

// Notification type to preference mapping
const TYPE_TO_PREF: Record<string, string> = {
  'LIKE': 'likes',
  'COMMENT': 'comments',
  'FOLLOW': 'follows',
  'MENTION': 'mentions',
  'MESSAGE': 'messages',
  'REPO_UPDATE': 'posts',
  'STORY_REPLY': 'comments',
};

// Push notification titles by type
const PUSH_TITLES: Record<string, string> = {
  'LIKE': 'New Like',
  'COMMENT': 'New Comment',
  'FOLLOW': 'New Follower',
  'MENTION': 'You were mentioned',
  'MESSAGE': 'New Message',
  'REPO_UPDATE': 'Repository Update',
  'STORY_REPLY': 'Story Reply',
};

// Map internal notification types to the adapter's NotificationType union
const TYPE_TO_ADAPTER: Record<string, AdapterNotificationType> = {
  'LIKE': 'like',
  'COMMENT': 'comment',
  'FOLLOW': 'follow',
  'MENTION': 'mention',
  'MESSAGE': 'message',
  'REPO_UPDATE': 'system',
  'STORY_REPLY': 'comment',
};

/**
 * Check if user has enabled notifications for this type
 */
async function shouldSendNotification(userId: string, type: string): Promise<{ send: boolean; pushEnabled: boolean }> {
  try {
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId }
    });

    // If no preferences exist, default to allowing all notifications
    if (!prefs) {
      return { send: true, pushEnabled: true };
    }

    const prefKey = TYPE_TO_PREF[type] as keyof typeof prefs;
    const send = prefKey ? Boolean(prefs[prefKey]) : true;

    return { send, pushEnabled: prefs.pushEnabled };
  } catch (error) {
    logger.error('Error checking notification preferences:', error);
    return { send: true, pushEnabled: true };
  }
}

/**
 * Core notification creation with real-time delivery
 */
export async function createNotification(
  userId: string,
  type: string,
  content: string,
  actorId?: string,
  postId?: string
) {
  try {
    // Step 1: Check user preferences
    const { send, pushEnabled } = await shouldSendNotification(userId, type);

    if (!send) {
      logger.debug(`Notification skipped for user ${userId}: preference disabled for ${type}`);
      return null;
    }

    // Step 2: Create notification in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: type as any,
        content,
        actorId,
        postId
      },
    });

    // Step 3: Fetch actor details for rich notification
    let actorDetails = null;
    if (actorId) {
      actorDetails = await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, username: true, avatar: true, displayName: true }
      });
    }

    // Step 4: Build notification payload
    const notificationPayload = {
      ...notification,
      actor: actorDetails,
    };

    // Step 5: Deliver via WebSocket if user is online
    if (isUserOnline(userId)) {
      emitToUser(userId, 'notification', notificationPayload);
      logger.debug(`Real-time notification sent to user ${userId}`);
    } else if (pushEnabled) {
      // Step 6: Send push notification if user is offline
      await sendPushNotificationToUser(userId, {
        title: PUSH_TITLES[type] || 'Gitgram',
        body: content,
        data: {
          type,
          notificationId: notification.id,
          postId,
          actorId,
        }
      });
      logger.debug(`Push notification sent to user ${userId}`);
    }

    // Step 7: Dispatch to multi-platform adapters (Telegram, Discord, Slack, Email)
    // Fire-and-forget — adapter failures are logged but never block the response.
    const adapterType = TYPE_TO_ADAPTER[type] ?? 'system';
    dispatcher.dispatch({
      userId,
      title: PUSH_TITLES[type] || 'Gitgram',
      body: content,
      type: adapterType,
      data: { notificationId: notification.id, postId, actorId },
      url: postId ? `https://gitgram.com/post/${postId}` : undefined,
    }).catch((err: unknown) => {
      logger.error('NotificationDispatcher: dispatch error', err);
    });

    return notification;
  } catch (error) {
    logger.error('Create notification error:', error);
    throw error;
  }
}

export async function createLikeNotification(
  postOwnerId: string,
  likerId: string,
  likerUsername: string,
  postId: string
) {
  if (postOwnerId === likerId) return;

  return createNotification(
    postOwnerId,
    'LIKE',
    `${likerUsername} liked your post`,
    likerId,
    postId
  );
}

export async function createCommentNotification(
  postOwnerId: string,
  commenterId: string,
  commenterUsername: string,
  postId: string
) {
  if (postOwnerId === commenterId) return;

  return createNotification(
    postOwnerId,
    'COMMENT',
    `${commenterUsername} commented on your post`,
    commenterId,
    postId
  );
}

export async function createFollowNotification(
  userId: string,
  followerId: string,
  followerUsername: string
) {
  if (userId === followerId) return;

  return createNotification(
    userId,
    'FOLLOW',
    `${followerUsername} started following you`,
    followerId
  );
}

export async function createMentionNotification(
  userId: string,
  mentionerId: string,
  mentionerUsername: string,
  postId: string
) {
  return createNotification(
    userId,
    'MENTION',
    `${mentionerUsername} mentioned you in a post`,
    mentionerId,
    postId
  );
}

export async function markNotificationsAsRead(userId: string, notificationIds?: string[]) {
  try {
    const where = notificationIds
      ? { userId, id: { in: notificationIds } }
      : { userId, read: false };

    const result = await prisma.notification.updateMany({
      where,
      data: { read: true },
    });

    // Emit updated unread count to user
    const newCount = await getUnreadCount(userId);
    if (isUserOnline(userId)) {
      emitToUser(userId, 'unread_count_updated', { count: newCount });
    }

    return result.count;
  } catch (error) {
    logger.error('Mark notifications as read error:', error);
    throw error;
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  } catch (error) {
    logger.error('Get unread count error:', error);
    return 0;
  }
}

// ── Notification grouping ─────────────────────────────────────────────────────
// Ports the grouping algorithm from Bluesky social-app (MIT) adapted for
// Gitgram's notification schema. Same-type notifications on the same subject
// within a 48-hour window are collapsed into one grouped entry so the feed
// shows "Alice and 2 others liked your post" instead of three separate rows.

const GROUPABLE_TYPES = new Set(['LIKE', 'FOLLOW']);
const MS_2DAY = 1000 * 60 * 60 * 48;

export interface RawNotification {
  id: string;
  userId: string;
  type: string;
  content: string;
  actorId: string | null;
  postId: string | null;
  read: boolean;
  createdAt: Date;
  actor?: { id: string; username: string; avatar: string | null } | null;
}

export interface GroupedNotification {
  notification: RawNotification;
  additional: RawNotification[];
  groupedContent: string;
}

export function groupNotifications(notifs: RawNotification[]): GroupedNotification[] {
  const grouped: GroupedNotification[] = [];

  for (const notif of notifs) {
    const ts = notif.createdAt.getTime();
    let merged = false;

    if (GROUPABLE_TYPES.has(notif.type)) {
      for (const g of grouped) {
        const ts2 = g.notification.createdAt.getTime();
        if (
          Math.abs(ts2 - ts) < MS_2DAY &&
          notif.type === g.notification.type &&
          notif.postId === g.notification.postId &&
          notif.actorId !== g.notification.actorId
        ) {
          g.additional.push(notif);
          g.groupedContent = buildGroupedContent(g.notification, g.additional);
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      grouped.push({
        notification: notif,
        additional: [],
        groupedContent: notif.content,
      });
    }
  }

  return grouped;
}

function buildGroupedContent(
  primary: RawNotification,
  additional: RawNotification[]
): string {
  const firstName = primary.actor?.username ?? 'Someone';
  const extra = additional.length;

  if (extra === 0) return primary.content;

  const action = primary.type === 'LIKE' ? 'liked your post' : 'followed you';

  if (extra === 1) {
    const secondName = additional[0].actor?.username ?? 'someone else';
    return `${firstName} and ${secondName} ${action}`;
  }

  return `${firstName} and ${extra} others ${action}`;
}
