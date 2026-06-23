import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    type: 'follow' | 'like' | 'comment' | 'mention';
    targetId: string;
  };
}

type NotificationTarget =
  | { kind: 'expo'; token: string; deviceId: string }
  | { kind: 'web'; subscription: PushSubscription; deviceId: string };

// ---------------------------------------------------------------------------
// Token registration
// ---------------------------------------------------------------------------

/**
 * Stores a Web Push subscription for the given user.
 * The endpoint is used as the unique push token for web devices.
 */
export async function registerWebPushToken(
  userId: string,
  subscription: PushSubscription,
): Promise<void> {
  const serialized = JSON.stringify(subscription);

  await prisma.pushDevice.upsert({
    where: { pushToken: subscription.endpoint },
    create: {
      userId,
      pushToken: subscription.endpoint,
      platform: 'WEB',
      active: true,
      // Store full subscription JSON in deviceName field as a fallback.
      // In production, use a dedicated webPushSubscription column.
      deviceName: serialized,
    },
    update: {
      userId,
      active: true,
      lastUsed: new Date(),
      deviceName: serialized,
    },
  });

  logger.info(`Web Push subscription registered for user ${userId}`);
}

/**
 * Stores an Expo push token for the given user.
 */
export async function registerExpoPushToken(
  userId: string,
  expoPushToken: string,
): Promise<void> {
  const platform = expoPushToken.startsWith('ExponentPushToken') ? 'IOS' : 'ANDROID';

  await prisma.pushDevice.upsert({
    where: { pushToken: expoPushToken },
    create: {
      userId,
      pushToken: expoPushToken,
      platform,
      active: true,
    },
    update: {
      userId,
      active: true,
      lastUsed: new Date(),
    },
  });

  logger.info(`Expo push token registered for user ${userId}`, { platform });
}

// ---------------------------------------------------------------------------
// Core send logic
// ---------------------------------------------------------------------------

/**
 * Resolves all active push targets for a user.
 */
async function resolveTargets(userId: string): Promise<NotificationTarget[]> {
  const devices = await prisma.pushDevice.findMany({
    where: { userId, active: true },
    select: { id: true, pushToken: true, platform: true, deviceName: true },
  });

  return devices.map((device): NotificationTarget => {
    if (device.platform === 'WEB') {
      let subscription: PushSubscription;
      try {
        subscription = JSON.parse(device.deviceName ?? '{}') as PushSubscription;
      } catch {
        subscription = { endpoint: device.pushToken, keys: { p256dh: '', auth: '' } };
      }
      return { kind: 'web', subscription, deviceId: device.id };
    }
    return { kind: 'expo', token: device.pushToken, deviceId: device.id };
  });
}

/**
 * Simulates sending an Expo push notification.
 * Replace the log statement with a real fetch to EXPO_PUSH_URL in production.
 */
async function dispatchExpo(
  token: string,
  payload: PushNotificationPayload,
): Promise<'ok' | 'gone'> {
  logger.info('[pushNotificationService] EXPO dispatch (simulated)', {
    to: token.slice(0, 30) + '…',
    title: payload.title,
    body: payload.body,
    data: payload.data,
  });
  return 'ok';
}

/**
 * Simulates sending a Web Push notification.
 * Replace the log statement with web-push.sendNotification() in production.
 */
async function dispatchWebPush(
  subscription: PushSubscription,
  payload: PushNotificationPayload,
): Promise<'ok' | 'gone'> {
  logger.info('[pushNotificationService] WEB PUSH dispatch (simulated)', {
    endpoint: subscription.endpoint.slice(0, 60) + '…',
    title: payload.title,
    body: payload.body,
    data: payload.data,
  });
  return 'ok';
}

/**
 * Sends a push notification to every registered device for the given user.
 * Invalid / expired tokens are marked inactive after the send attempt.
 */
export async function sendNotificationToUser(
  userId: string,
  notification: PushNotificationPayload,
): Promise<void> {
  const targets = await resolveTargets(userId);

  if (targets.length === 0) {
    logger.debug(`[pushNotificationService] No active devices for user ${userId}`);
    return;
  }

  const expiredIds: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      const result =
        target.kind === 'expo'
          ? await dispatchExpo(target.token, notification)
          : await dispatchWebPush(target.subscription, notification);

      if (result === 'gone') {
        expiredIds.push(target.deviceId);
      }
    }),
  );

  if (expiredIds.length > 0) {
    await prisma.pushDevice.updateMany({
      where: { id: { in: expiredIds } },
      data: { active: false },
    });
    logger.warn(`[pushNotificationService] Marked ${expiredIds.length} token(s) as inactive`, {
      userId,
    });
  }

  logger.info(`[pushNotificationService] Notification sent to user ${userId}`, {
    deviceCount: targets.length,
    title: notification.title,
  });
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

export async function sendFollowNotification(
  targetUserId: string,
  followerUsername: string,
): Promise<void> {
  await sendNotificationToUser(targetUserId, {
    title: 'New Follower',
    body: `@${followerUsername} followed you`,
    data: { type: 'follow', targetId: targetUserId },
  });
}

export async function sendLikeNotification(
  targetUserId: string,
  likerUsername: string,
  postId: string,
): Promise<void> {
  await sendNotificationToUser(targetUserId, {
    title: 'New Like',
    body: `@${likerUsername} liked your post`,
    data: { type: 'like', targetId: postId },
  });
}

export async function sendCommentNotification(
  targetUserId: string,
  commenterUsername: string,
  postId: string,
): Promise<void> {
  await sendNotificationToUser(targetUserId, {
    title: 'New Comment',
    body: `@${commenterUsername} commented on your post`,
    data: { type: 'comment', targetId: postId },
  });
}

export async function sendMentionNotification(
  targetUserId: string,
  mentionerUsername: string,
  postId: string,
): Promise<void> {
  await sendNotificationToUser(targetUserId, {
    title: 'You were mentioned',
    body: `@${mentionerUsername} mentioned you in a post`,
    data: { type: 'mention', targetId: postId },
  });
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Removes all tokens that have been marked inactive (returned 404 / gone).
 * Returns the count of deleted records.
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const { count } = await prisma.pushDevice.deleteMany({
    where: { active: false },
  });

  logger.info(`[pushNotificationService] Cleaned up ${count} expired push token(s)`);
  return count;
}
