import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { getAuthToken } from '../services/gitgramApi';
import {
  registerForPushNotifications,
  savePushToken,
  setupNotificationListeners,
} from '../services/pushNotificationService';

// Keep the splash screen visible while we fetch resources.
SplashScreen.preventAutoHideAsync();

const darkScreenOptions = {
  headerStyle: { backgroundColor: '#0F0F1A' },
  headerTintColor: '#E2E8F0',
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: '#0F0F1A' },
  animation: 'slide_from_right' as const,
};

export default function RootLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    let notificationSubscription: ReturnType<typeof setupNotificationListeners> | null = null;

    async function prepare() {
      try {
        const token = await getAuthToken();
        setIsAuthenticated(!!token);

        if (token) {
          const pushToken = await registerForPushNotifications();
          if (pushToken) {
            await savePushToken(pushToken).catch(() => {
              // Non-fatal: push token save failure must not block the app
            });
          }
        }

        notificationSubscription = setupNotificationListeners();
      } catch {
        // Errors here should not crash the app — mark ready anyway
        setIsAuthenticated(false);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();

    return () => {
      notificationSubscription?.remove();
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // Hide the splash screen once the root view has laid out.
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady || isAuthenticated === null) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root} onLayout={onLayoutRootView}>
          <StatusBar style="light" backgroundColor="#0F0F1A" />
          <Stack
            screenOptions={darkScreenOptions}
            initialRouteName={isAuthenticated ? '(tabs)' : '(auth)/login'}
          >
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="settings"
              options={{ title: 'Settings', presentation: 'card' }}
            />
            <Stack.Screen name="saved" options={{ headerShown: false }} />
            <Stack.Screen name="reading-list" options={{ headerShown: false }} />
            <Stack.Screen name="snippets/index" options={{ headerShown: false }} />
            <Stack.Screen name="trending/index" options={{ headerShown: false }} />
            <Stack.Screen name="collections/index" options={{ headerShown: false }} />
            <Stack.Screen name="languages/index" options={{ headerShown: false }} />
            <Stack.Screen
              name="post/[id]"
              options={{ title: '', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="profile/[username]"
              options={{ title: '', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="repo/[owner]/[repo]"
              options={{ title: '', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="search"
              options={{ title: 'Search', animation: 'slide_from_bottom', presentation: 'card' }}
            />
            <Stack.Screen
              name="story/[id]"
              options={{ headerShown: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="stories/index"
              options={{ headerShown: false, animation: 'fade', presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="onboarding/index"
              options={{ headerShown: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="onboarding/interests"
              options={{ title: '', headerBackTitle: 'Back', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="onboarding/follow"
              options={{ title: '', headerBackTitle: 'Back', animation: 'slide_from_right' }}
            />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
});
