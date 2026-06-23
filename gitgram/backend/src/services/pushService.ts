import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: 'default' | null;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}

/**
 * Send push notification to a specific user (all their devices)
 */
export async function sendPushNotificationToUser(
  userId: string,
  notification: PushPayload
): Promise<void> {
  try {
    const devices = await prisma.pushDevice.findMany({
      where: { userId, active: true }
    });

    if (devices.length === 0) {
      logger.debug(`No active devices for user ${userId}`);
      return;
    }

    const messages: ExpoPushMessage[] = devices.map((device) => ({
      to: device.pushToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: notification.sound ?? 'default',
      badge: notification.badge,
      channelId: 'default',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json() as { data?: ExpoPushTicket[] };

    // Handle tickets - deactivate invalid tokens
    if (result.data) {
      await handlePushTickets(devices, result.data);
    }

    logger.info(`Push notifications sent to user ${userId}`, {
      deviceCount: devices.length,
      success: response.ok,
    });
  } catch (error) {
    logger.error('Send push notification error:', error);
    // Don't throw - push failures shouldn't break the main flow
  }
}

/**
 * Handle Expo push tickets - deactivate invalid tokens
 */
async function handlePushTickets(
  devices: { id: string; pushToken: string }[],
  tickets: ExpoPushTicket[]
): Promise<void> {
  const invalidTokenIds: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokenIds.push(devices[index].id);
        logger.warn(`Device token invalid, marking inactive: ${devices[index].pushToken.slice(0, 20)}...`);
      } else {
        logger.error(`Push error for device ${devices[index].id}:`, ticket.message);
      }
    }
  });

  if (invalidTokenIds.length > 0) {
    await prisma.pushDevice.updateMany({
      where: { id: { in: invalidTokenIds } },
      data: { active: false },
    });
  }
}

/**
 * Send push notification to multiple users (batch)
 */
export async function sendBatchPushNotifications(
  userIds: string[],
  notification: PushPayload
): Promise<void> {
  try {
    const devices = await prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        active: true,
      },
    });

    if (devices.length === 0) return;

    const BATCH_SIZE = 100;
    const messages: ExpoPushMessage[] = devices.map((device) => ({
      to: device.pushToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
    }));

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
    }

    logger.info(`Batch push sent to ${devices.length} devices for ${userIds.length} users`);
  } catch (error) {
    logger.error('Batch push notification error:', error);
  }
}

/**
 * Register a device for push notifications
 */
export async function registerPushDevice(
  userId: string,
  pushToken: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string
): Promise<void> {
  try {
    await prisma.pushDevice.upsert({
      where: { pushToken },
      create: {
        userId,
        pushToken,
        platform: platform.toUpperCase() as 'IOS' | 'ANDROID' | 'WEB',
        deviceName,
        active: true,
      },
      update: {
        userId,
        active: true,
        lastUsed: new Date(),
        deviceName,
      },
    });

    logger.info(`Device registered for user ${userId}`, { platform });
  } catch (error) {
    logger.error('Register push device error:', error);
    throw error;
  }
}

/**
 * Unregister a device (e.g., on logout)
 */
export async function unregisterPushDevice(pushToken: string): Promise<void> {
  try {
    await prisma.pushDevice.update({
      where: { pushToken },
      data: { active: false },
    });
  } catch (error) {
    logger.error('Unregister push device error:', error);
  }
}

/**
 * Unregister all devices for a user (e.g., on account deletion)
 */
export async function unregisterAllUserDevices(userId: string): Promise<void> {
  try {
    await prisma.pushDevice.updateMany({
      where: { userId },
      data: { active: false },
    });
  } catch (error) {
    logger.error('Unregister all devices error:', error);
  }
}
