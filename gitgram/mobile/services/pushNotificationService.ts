import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { logger } from '../utils/logger';

const PUSH_TOKEN_STORAGE_KEY = '@gitgram_push_token';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Get projectId for Expo push notifications
const getProjectId = (): string | undefined => {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
};

export const pushNotificationService = {
  // Register for push notifications
  registerForPushNotifications: async (): Promise<string | null> => {
    try {
      if (!Device.isDevice) {
        logger.warn('Push notifications only work on physical devices');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        logger.warn('Failed to get push token for push notification!');
        return null;
      }

      // Get Expo push token with projectId
      const projectId = getProjectId();
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const token = tokenData.data;
      logger.log('Push token:', token);

      // Store token locally for later unregistration
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);

      // Send token to backend
      try {
        await api.post('/push-notifications/register-device', {
          pushToken: token,
          platform: Platform.OS,
          deviceName: Device.deviceName || `${Device.brand} ${Device.modelName}`,
        });
        logger.info('Device registered for push notifications successfully');
      } catch (error) {
        logger.error('Failed to register device token:', error);
      }

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      return token;
    } catch (error) {
      logger.error('Register push notifications error:', error);
      return null;
    }
  },

  // Unregister device from push notifications (call on logout)
  unregisterPushNotifications: async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

      if (token) {
        // Unregister from backend
        try {
          await api.post('/push-notifications/unregister-device', {
            pushToken: token,
          });
          logger.info('Device unregistered from push notifications');
        } catch (error) {
          logger.error('Failed to unregister device token:', error);
        }

        // Clear stored token
        await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      }
    } catch (error) {
      logger.error('Unregister push notifications error:', error);
    }
  },

  // Get stored push token
  getStoredPushToken: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    } catch (error) {
      logger.error('Failed to get stored push token:', error);
      return null;
    }
  },

  // Set up notification listeners
  setupNotificationListeners: (
    onNotificationReceived: (notification: Notifications.Notification) => void,
    onNotificationTapped: (response: Notifications.NotificationResponse) => void
  ) => {
    // Foreground notification listener
    const receivedListener = Notifications.addNotificationReceivedListener(
      onNotificationReceived
    );

    // Background/foreground notification tap listener
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      onNotificationTapped
    );

    return () => {
      receivedListener.remove();
      responseListener.remove();
    };
  },

  // Get notification permissions
  getPermissions: async () => {
    return await Notifications.getPermissionsAsync();
  },

  // Request notification permissions
  requestPermissions: async () => {
    return await Notifications.requestPermissionsAsync();
  },

  // Cancel all notifications
  cancelAllNotifications: async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  // Set badge count
  setBadgeCount: async (count: number) => {
    await Notifications.setBadgeCountAsync(count);
  },
};

