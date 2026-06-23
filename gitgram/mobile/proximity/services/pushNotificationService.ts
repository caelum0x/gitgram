import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { apiClient } from './gitgramApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationData {
  type?: 'like' | 'comment' | 'follow' | 'message';
  postId?: string;
  userId?: string;
  conversationId?: string;
}

// ---------------------------------------------------------------------------
// Permission & token registration
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

// ---------------------------------------------------------------------------
// Persist token on backend
// ---------------------------------------------------------------------------

export async function savePushToken(token: string): Promise<void> {
  await apiClient<void>('/v1/users/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// ---------------------------------------------------------------------------
// Navigation on tap
// ---------------------------------------------------------------------------

export function handleNotificationTap(
  notification: Notifications.Notification,
): void {
  const data = (notification.request.content.data ?? {}) as NotificationData;

  switch (data.type) {
    case 'like':
    case 'comment':
      if (data.postId) {
        router.push(`/post/${data.postId}`);
      } else {
        router.push('/(tabs)');
      }
      break;

    case 'follow':
      if (data.userId) {
        router.push(`/profile/${data.userId}`);
      } else {
        router.push('/(tabs)');
      }
      break;

    case 'message':
      if (data.conversationId) {
        router.push(`/messages/${data.conversationId}`);
      } else {
        router.push('/(tabs)');
      }
      break;

    default:
      router.push('/(tabs)');
  }
}

// ---------------------------------------------------------------------------
// Listener setup
// ---------------------------------------------------------------------------

export function setupNotificationListeners(): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationTap(response.notification);
  });
}
