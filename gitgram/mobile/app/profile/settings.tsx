import React from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Every route below resolves to a real screen. Account/Privacy/Theme/Language/Help
// live under app/profile/settings/*, Security is the hub at
// app/profile/settings/security.tsx, and Notifications/About reuse the complete
// screens under app/settings/*.
const SETTINGS_ITEMS = [
  { icon: 'person', label: 'Account', route: '/profile/settings/account' },
  { icon: 'notifications', label: 'Notifications', route: '/settings/notifications' },
  { icon: 'lock', label: 'Privacy', route: '/profile/settings/privacy' },
  { icon: 'security', label: 'Security', route: '/profile/settings/security' },
  { icon: 'palette', label: 'Theme', route: '/profile/settings/theme' },
  { icon: 'language', label: 'Language', route: '/profile/settings/language' },
  { icon: 'help', label: 'Help & Support', route: '/profile/settings/help' },
  { icon: 'info', label: 'About', route: '/settings/about' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
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
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <ThemedText type="title">Settings</ThemedText>
        </View>

        <View style={styles.section}>
          {SETTINGS_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.item}
              onPress={() => router.push(item.route as any)}
            >
              <View style={styles.itemLeft}>
                <View style={styles.iconContainer}>
                  <Icon name={item.icon} size={24} color={Colors.text} />
                </View>
                <ThemedText style={styles.itemLabel}>{item.label}</ThemedText>
              </View>
              <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <ThemedText style={styles.logoutText}>Log Out</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  section: {
    marginTop: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    alignItems: 'center',
    marginRight: 12,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  logoutButton: {
    marginTop: 32,
    marginHorizontal: 20,
    marginBottom: 40,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});
