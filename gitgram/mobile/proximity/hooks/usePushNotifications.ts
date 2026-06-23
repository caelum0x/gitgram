import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { API_BASE_URL } from '../../../constants/Config';

// Display notifications while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface NotificationData {
  type?: string;
  postId?: string;
  username?: string;
  owner?: string;
  repo?: string;
}

function getRouteFromData(data: NotificationData): string | null {
  if (data.type === 'post' && data.postId) {
    return `/post/${data.postId}`;
  }
  if (data.type === 'profile' && data.username) {
    return `/profile/${data.username}`;
  }
  if (data.type === 'repo' && data.owner && data.repo) {
    return `/repo/${data.owner}/${data.repo}`;
  }
  return null;
}

async function requestPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function getExpoPushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

async function registerTokenWithBackend(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/push-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
}

export function usePushNotifications(): void {
  const foregroundSubscription = useRef<Notifications.Subscription | null>(null);
  const responseSubscription = useRef<Notifications.Subscription | null>(null);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as NotificationData;
      const route = getRouteFromData(data);
      if (route) {
        // Small delay ensures navigation stack is ready after cold start
        setTimeout(() => {
          router.push(route as never);
        }, 100);
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    async function setup(): Promise<void> {
      const granted = await requestPermissions();
      if (!granted || !isMounted) {
        return;
      }

      const token = await getExpoPushToken();
      if (token && isMounted) {
        try {
          await registerTokenWithBackend(token);
        } catch {
          // Non-fatal: token registration failure should not crash the app
        }
      }
    }

    setup();

    // Show in-app banner for foreground notifications
    foregroundSubscription.current =
      Notifications.addNotificationReceivedListener((_notification) => {
        // Notification displayed automatically via setNotificationHandler above
      });

    // Navigate when the user taps a notification
    responseSubscription.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    // Handle tap that cold-started the app
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && isMounted) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      isMounted = false;
      foregroundSubscription.current?.remove();
      responseSubscription.current?.remove();
    };
  }, [handleNotificationResponse]);
}
