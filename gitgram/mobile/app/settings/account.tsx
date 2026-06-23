import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuthStore } from '../../store/authStore';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const settings = [
    {
      id: 'edit-profile',
      label: 'Edit Profile',
      icon: 'edit',
      onPress: () => router.push('/(modals)/edit-profile'),
    },
    {
      id: 'change-password',
      label: 'Change Password',
      icon: 'lock',
      onPress: () => router.push('/account/security'),
    },
    {
      id: 'two-factor',
      label: 'Two-Factor Authentication',
      icon: 'security',
      onPress: () => router.push('/account/security/2fa-setup'),
    },
    {
      id: 'sessions',
      label: 'Active Sessions',
      icon: 'devices',
      onPress: () => router.push('/account/security/sessions'),
    },
    {
      id: 'freeze',
      label: 'Freeze Account',
      icon: 'pause-circle',
      onPress: () => router.push('/account/freeze'),
    },
    {
      id: 'delete',
      label: 'Delete Account',
      icon: 'delete',
      onPress: () => router.push('/account/delete'),
      destructive: true,
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <Header title="Account" />
      <View style={styles.content}>
        {settings.map((setting) => (
          <TouchableOpacity
            key={setting.id}
            style={styles.settingItem}
            onPress={setting.onPress}
          >
            <Icon
              name={setting.icon}
              size={24}
              color={setting.destructive ? Colors.error || '#ff4444' : Colors.accent}
            />
            <Text
              style={[
                styles.settingLabel,
                setting.destructive && styles.destructiveText,
              ]}
            >
              {setting.label}
            </Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  destructiveText: {
    color: Colors.error || '#ff4444',
  },
  logoutButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.error || '#ff4444',
  },
  logoutButtonText: {
    color: Colors.error || '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

