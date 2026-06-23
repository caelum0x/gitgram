import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

const settingsSections = [
  {
    title: 'Account',
    items: [
      { icon: 'edit', label: 'Edit Profile', route: '/(modals)/edit-profile' },
      { icon: 'lock', label: 'Change Password', route: '/settings/password' },
      { icon: 'email', label: 'Email Settings', route: '/settings/email' },
      { icon: 'delete', label: 'Delete Account', route: '/settings/delete-account' },
    ],
  },
  {
    title: 'Privacy',
    items: [
      { icon: 'visibility', label: 'Privacy Settings', route: '/settings/privacy' },
      { icon: 'block', label: 'Blocked Users', route: '/settings/blocked' },
      { icon: 'security', label: 'Security', route: '/settings/security' },
    ],
  },
  {
    title: 'Content',
    items: [
      { icon: 'bookmark', label: 'Saved Posts', route: '/profile/saved' },
      { icon: 'archive', label: 'Archived Posts', route: '/profile/archived' },
      { icon: 'collections', label: 'Story Highlights', route: '/story/highlights' },
    ],
  },
];

export default function ProfileSettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Header title="Profile Settings" />
      <ScrollView style={styles.content}>
        {settingsSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.settingItem}
                onPress={() => router.push(item.route as any)}
              >
                <Icon name={item.icon} size={24} color={Colors.text} />
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
});

