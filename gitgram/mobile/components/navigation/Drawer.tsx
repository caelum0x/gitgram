import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { Image } from 'expo-image';

interface DrawerItem {
  icon?: string;
  label?: string;
  route?: string;
  onPress?: () => void;
  divider?: boolean;
}

export default function Drawer() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const menuItems: DrawerItem[] = [
    { icon: 'home', label: 'Home', route: '/(tabs)/home' },
    { icon: 'account-circle', label: 'Profile', route: '/(tabs)/profile' },
    { icon: 'explore', label: 'Explore', route: '/(tabs)/explore' },
    { icon: 'notifications', label: 'Notifications', route: '/(tabs)/notifications' },
    { icon: 'message', label: 'Messages', route: '/(tabs)/messages' },
    { icon: 'bookmark', label: 'Saved', route: '/(tabs)/profile?tab=saved' },
    { icon: 'settings', label: 'Settings', route: '/settings' },
    { icon: 'help', label: 'Help', route: '/help' },
    { divider: true },
    { icon: 'logout', label: 'Logout', onPress: handleLogout },
  ];

  function handleLogout() {
    logout();
    router.replace('/(auth)/login');
  }

  const handleItemPress = (item: DrawerItem) => {
    if (item.onPress) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Icon name="account-circle" size={60} color={Colors.accent} />
          </View>
        )}
        <Text style={styles.username}>@{user?.username || 'User'}</Text>
        {user?.bio && <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text>}
      </View>

      <ScrollView style={styles.menu}>
        {menuItems.map((item, index) => {
          if (item.divider) {
            return <View key={`divider-${index}`} style={styles.divider} />;
          }
          if (!item.icon || !item.label) {
            return null;
          }
          return (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={() => handleItemPress(item)}
            >
              <Icon name={item.icon} size={24} color={Colors.text} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
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
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
});

