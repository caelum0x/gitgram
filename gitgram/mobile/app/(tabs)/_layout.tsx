import { Tabs } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { emitSoftReset } from '../../utils/events';

/**
 * Fires a soft reset (scroll-to-top + refresh) when the user taps the tab that
 * is already focused. React Navigation still navigates on a normal tab switch,
 * so we gate on `navigation.isFocused()` to only react to a re-press.
 */
const softResetListeners = ({
  navigation,
}: {
  navigation: { isFocused: () => boolean };
}) => ({
  tabPress: () => {
    if (navigation.isFocused()) {
      emitSoftReset();
    }
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        listeners={softResetListeners}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Icon name="home" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create-post"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: ({ color, size }) => (
            <Icon name="play-circle-outline" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        listeners={softResetListeners}
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Icon name="explore" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Icon name="message" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        listeners={softResetListeners}
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, size }) => (
            <Icon name="notifications" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Icon name="account-circle" size={size || 24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

