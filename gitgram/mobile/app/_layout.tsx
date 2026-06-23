import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import NetworkStatus from '../components/common/NetworkStatus';
import { pushNotificationService } from '../services/pushNotificationService';
import { paymentDeepLinkHandler } from '../utils/paymentDeepLinkHandler';
import { setupNotificationDeepLinkHandler, handleNotificationDeepLink } from '../utils/notificationDeepLinkHandler';
import { logger } from '../utils/logger';

export default function RootLayout() {
  const { initialize, isAuthenticated } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // Register for push notifications when user is authenticated
      pushNotificationService.registerForPushNotifications();

      // Set up notification listeners
      const notificationCleanup = pushNotificationService.setupNotificationListeners(
        (notification) => {
          logger.log('Notification received:', notification);
        },
        (response) => {
          logger.log('Notification tapped:', response);
          // Handle deep linking from notification
          handleNotificationDeepLink(response);
        }
      );

      // Set up deep link handler for notifications
      const deepLinkCleanup = setupNotificationDeepLinkHandler();

      return () => {
        notificationCleanup();
        deepLinkCleanup();
      };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Initialize payment deep link handler
    // The handler is already initialized in its constructor
    // This effect ensures it stays active during app lifecycle
    
    return () => {
      // Cleanup is handled by the singleton instance
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NetworkStatus />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(modals)" />
          </Stack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
