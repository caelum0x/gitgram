import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getNotificationsUnreadCount,
  getMessagesUnreadCount,
} from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

const COLORS = {
  background: '#0F0F1A',
  active: '#7C3AED',
  inactive: '#6B7280',
  border: '#2D2D50',
  headerTint: '#E2E8F0',
} as const;

const TAB_BAR_BASE_HEIGHT = 65;
const LABEL_FONT_SIZE = 10;
const UNREAD_REFRESH_MS = 30_000;

// Icon names are constrained to valid Ionicons glyphs at compile time.
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

/** Light haptic tap on tab press. iOS only — silently skipped elsewhere. */
function triggerTabHaptic(): void {
  if (Platform.OS !== 'ios') {
    return;
  }
  // Fire-and-forget: haptics must never block navigation or throw upward.
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    /* haptics are best-effort */
  });
}

// ---------------------------------------------------------------------------
// Unread badge polling
// ---------------------------------------------------------------------------

interface UnreadCounts {
  notifications: number;
  messages: number;
}

/**
 * Polls the notification and message unread-count endpoints, refreshing every
 * {@link UNREAD_REFRESH_MS}. Failures are swallowed so a transient network
 * error never crashes the tab bar; the previous count is retained.
 */
function useUnreadCounts(): UnreadCounts {
  const [counts, setCounts] = useState<UnreadCounts>({
    notifications: 0,
    messages: 0,
  });
  const isMounted = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    const [notifications, messages] = await Promise.all([
      getNotificationsUnreadCount().catch(() => null),
      getMessagesUnreadCount().catch(() => null),
    ]);

    if (!isMounted.current) {
      return;
    }

    setCounts((prev) => ({
      notifications: notifications ?? prev.notifications,
      messages: messages ?? prev.messages,
    }));
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), UNREAD_REFRESH_MS);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  return counts;
}

/** Normalize a raw count into an Expo Router tabBarBadge value. */
function badgeFor(count: number): number | undefined {
  return count > 0 ? count : undefined;
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

interface TabIconProps {
  base: IoniconName;
  active: IoniconName;
  color: string;
  size: number;
  focused: boolean;
}

function TabIcon({ base, active, color, size, focused }: TabIconProps) {
  return (
    <Ionicons name={focused ? active : base} size={size} color={color} />
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { notifications, messages } = useUnreadCounts();

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.active,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarLabelStyle: { fontSize: LABEL_FONT_SIZE },
        tabBarBadgeStyle: {
          backgroundColor: COLORS.active,
          fontSize: 10,
        },
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.headerTint,
        headerTitleStyle: { fontWeight: '700' },
      }}
      screenListeners={{
        tabPress: () => triggerTabHaptic(),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'Gitgram',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="home-outline"
              active="home"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="compass-outline"
              active="compass"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="film-outline"
              active="film"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color, size, focused }) => (
            // Create is visually emphasized with a larger glyph.
            <TabIcon
              base="add-circle-outline"
              active="add-circle"
              color={color}
              size={size + 12}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'DMs',
          tabBarBadge: badgeFor(messages),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="chatbubble-outline"
              active="chatbubble"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarBadge: badgeFor(notifications),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="notifications-outline"
              active="notifications"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              base="person-circle-outline"
              active="person-circle"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
