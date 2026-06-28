import webpush from 'web-push';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@gitgram.dev';

let webPushConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushConfigured = true;
    logger.info('[pushNotificationService] Web Push (VAPID) configured');
  } catch (error) {
    logger.error('[pushNotificationService] Invalid VAPID configuration', error);
  }
} else {
  logger.warn(
    '[pushNotificationService] VAPID keys not configured — web push notifications are disabled',
  );
}

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
      webPushSubscription: serialized,
    },
    update: {
      userId,
      active: true,
      lastUsed: new Date(),
      webPushSubscription: serialized,
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
    select: { id: true, pushToken: true, platform: true, webPushSubscription: true },
  });

  return devices.map((device): NotificationTarget => {
    if (device.platform === 'WEB') {
      let subscription: PushSubscription;
      try {
        subscription = JSON.parse(device.webPushSubscription ?? '{}') as PushSubscription;
      } catch {
        subscription = { endpoint: device.pushToken, keys: { p256dh: '', auth: '' } };
      }
      return { kind: 'web', subscription, deviceId: device.id };
    }
    return { kind: 'expo', token: device.pushToken, deviceId: device.id };
  });
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends an Expo push notification via the Expo Push API.
 * Returns 'gone' when the device token is no longer registered so the caller
 * can deactivate it.
 */
async function dispatchExpo(
  token: string,
  payload: PushNotificationPayload,
): Promise<'ok' | 'gone'> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default',
        channelId: 'default',
      }),
    });

    if (!response.ok) {
      logger.error('[pushNotificationService] Expo push HTTP error', {
        status: response.status,
      });
      return 'ok';
    }

    const result = (await response.json()) as { data?: ExpoPushTicket };
    const ticket = result.data;

    if (ticket?.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') {
        return 'gone';
      }
      logger.error('[pushNotificationService] Expo push ticket error', {
        message: ticket.message,
      });
    }

    return 'ok';
  } catch (error) {
    logger.error('[pushNotificationService] Expo dispatch failed', error);
    return 'ok';
  }
}

/**
 * Sends a Web Push notification using the VAPID-authenticated web-push library.
 * Returns 'gone' when the subscription has expired (HTTP 404/410) so the caller
 * can deactivate the device.
 */
async function dispatchWebPush(
  subscription: PushSubscription,
  payload: PushNotificationPayload,
): Promise<'ok' | 'gone'> {
  if (!webPushConfigured) {
    logger.warn(
      '[pushNotificationService] Skipping web push — VAPID not configured',
    );
    return 'ok';
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    logger.warn('[pushNotificationService] Skipping web push — incomplete subscription');
    return 'ok';
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        data: payload.data,
      }),
    );
    return 'ok';
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;

    if (statusCode === 404 || statusCode === 410) {
      return 'gone';
    }

    logger.error('[pushNotificationService] Web push dispatch failed', error);
    return 'ok';
  }
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
