import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useHaptics } from '../hooks/useHaptics';
import { authService } from '../services/authService';
import { logger } from '../utils/logger';

interface MenuItem {
  icon: string;
  label: string;
  route?: string;
  onPress?: () => void;
  divider?: boolean;
}

/**
 * App menu — the single entry point to top-level areas that are not tabs:
 * Saved (posts/repos/collections), Reading List, Snippets, Settings, Help, and
 * Ads. Reachable from the profile tab header so every built screen has a path.
 */
export default function MenuScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const hapticsDisabled = useSettingsStore((state) => state.hapticsDisabled);
  const setHapticsDisabled = useSettingsStore((state) => state.setHapticsDisabled);
  const altTextRequired = useSettingsStore((state) => state.altTextRequired);
  const setAltTextRequired = useSettingsStore((state) => state.setAltTextRequired);
  const haptics = useHaptics();

  const toggleHaptics = (value: boolean) => {
    // Fire a confirming buzz only when turning haptics back on.
    if (!value) {
      haptics('Light');
    }
    void setHapticsDisabled(!value);
  };

  const handleLogout = () => {
    const run = async () => {
      const { refreshToken } = useAuthStore.getState();
      try {
        if (refreshToken) {
          await authService.logout(refreshToken);
        }
      } catch (error) {
        logger.error('Logout error:', error);
      } finally {
        await logout();
        router.replace('/(auth)/login');
      }
    };
    void run();
  };

  const menuItems: MenuItem[] = [
    { icon: 'person', label: 'Profile', route: '/(tabs)/profile' },
    { icon: 'bookmark', label: 'Saved Posts', route: '/saved/posts' },
    { icon: 'folder-special', label: 'Saved Repositories', route: '/saved/repos' },
    { icon: 'collections-bookmark', label: 'Collections', route: '/saved/collections' },
    { icon: 'menu-book', label: 'Reading List', route: '/reading-list' },
    { icon: 'code', label: 'Snippets', route: '/snippets' },
    { divider: true, icon: '', label: '' },
    { icon: 'campaign', label: 'Ads', route: '/ads' },
    { icon: 'settings', label: 'Settings', route: '/profile/settings' },
    { icon: 'help', label: 'Help & Support', route: '/profile/settings/help' },
    { divider: true, icon: '', label: '' },
    { icon: 'logout', label: 'Log Out', onPress: handleLogout },
  ];

  const handlePress = (item: MenuItem) => {
    if (item.onPress) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Icon name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Menu</Text>
        <View style={styles.closeButton} />
      </View>

      <View style={styles.profileHeader}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Icon name="account-circle" size={56} color={Colors.accent} />
          </View>
        )}
        <View style={styles.profileText}>
          <Text style={styles.username}>@{user?.username || 'User'}</Text>
          {user?.bio ? (
            <Text style={styles.bio} numberOfLines={2}>
              {user.bio}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.menu}>
        <View style={styles.toggleRow}>
          <Icon name="vibration" size={24} color={Colors.text} />
          <Text style={styles.menuLabel}>Haptic Feedback</Text>
          <Switch
            value={!hapticsDisabled}
            onValueChange={toggleHaptics}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.white}
          />
        </View>
        <View style={styles.toggleRow}>
          <Icon name="accessibility-new" size={24} color={Colors.text} />
          <Text style={styles.menuLabel}>Require Alt Text</Text>
          <Switch
            value={altTextRequired}
            onValueChange={(value) => void setAltTextRequired(value)}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.white}
          />
        </View>
        <View style={styles.divider} />
        {menuItems.map((item, index) => {
          if (item.divider) {
            return <View key={`divider-${index}`} style={styles.divider} />;
          }
          return (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={() => handlePress(item)}
            >
              <Icon name={item.icon} size={24} color={Colors.text} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.route ? (
                <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileText: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  menu: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: 16,
  },
  divider: {
    height: 8,
    backgroundColor: Colors.surface,
  },
});
