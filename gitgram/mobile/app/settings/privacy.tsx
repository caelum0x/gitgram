import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { settingsService } from '../../services/settingsService';

export default function PrivacySettingsScreen() {
  const [settings, setSettings] = useState({
    profileVisibility: 'public', // 'public', 'private'
    showActivityStatus: true,
    allowMessagesFrom: 'everyone', // 'everyone', 'followers', 'none'
    showReadReceipts: true,
    blockMessagesFromBlockedUsers: true,
    hideProfileFromSearch: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getPrivacySettings();
      if (response.settings) {
        setSettings({
          profileVisibility: response.settings.profileVisibility || 'public',
          showActivityStatus: response.settings.showActivityStatus ?? true,
          allowMessagesFrom: response.settings.allowMessagesFrom || 'everyone',
          showReadReceipts: response.settings.showReadReceipts ?? true,
          blockMessagesFromBlockedUsers: response.settings.blockMessagesFromBlockedUsers ?? true,
          hideProfileFromSearch: response.settings.hideProfileFromSearch ?? false,
        });
      }
    } catch (error) {
      logger.error('Load privacy settings error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updatePrivacySettings(settings);
      Alert.alert('Success', 'Privacy settings saved');
    } catch (error) {
      logger.error('Save privacy settings error:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Privacy" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Profile Visibility</Text>
              <Text style={styles.settingDescription}>
                Control who can see your profile
              </Text>
            </View>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                Alert.alert(
                  'Profile Visibility',
                  'Choose visibility',
                  [
                    { text: 'Public', onPress: () => setSettings({ ...settings, profileVisibility: 'public' }) },
                    { text: 'Private', onPress: () => setSettings({ ...settings, profileVisibility: 'private' }) },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Text style={styles.optionText}>
                {settings.profileVisibility.charAt(0).toUpperCase() + settings.profileVisibility.slice(1)}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Activity Status</Text>
              <Text style={styles.settingDescription}>
                Show when you're online
              </Text>
            </View>
            <Switch
              value={settings.showActivityStatus}
              onValueChange={(value) => setSettings({ ...settings, showActivityStatus: value })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Hide from Search</Text>
              <Text style={styles.settingDescription}>
                Don't show your profile in search results
              </Text>
            </View>
            <Switch
              value={settings.hideProfileFromSearch}
              onValueChange={(value) => setSettings({ ...settings, hideProfileFromSearch: value })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Messages</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Who can message you</Text>
              <Text style={styles.settingDescription}>
                Control who can send you messages
              </Text>
            </View>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                Alert.alert(
                  'Message Settings',
                  'Choose who can message you',
                  [
                    { text: 'Everyone', onPress: () => setSettings({ ...settings, allowMessagesFrom: 'everyone' }) },
                    { text: 'Followers Only', onPress: () => setSettings({ ...settings, allowMessagesFrom: 'followers' }) },
                    { text: 'None', onPress: () => setSettings({ ...settings, allowMessagesFrom: 'none' }) },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Text style={styles.optionText}>
                {settings.allowMessagesFrom.charAt(0).toUpperCase() + settings.allowMessagesFrom.slice(1)}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Read Receipts</Text>
              <Text style={styles.settingDescription}>
                Show when you've read messages
              </Text>
            </View>
            <Switch
              value={settings.showReadReceipts}
              onValueChange={(value) => setSettings({ ...settings, showReadReceipts: value })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Block Messages from Blocked Users</Text>
              <Text style={styles.settingDescription}>
                Automatically block messages from users you've blocked
              </Text>
            </View>
            <Switch
              value={settings.blockMessagesFromBlockedUsers}
              onValueChange={(value) => setSettings({ ...settings, blockMessagesFromBlockedUsers: value })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.saveButtonText}>Save Settings</Text>
          )}
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
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 6,
  },
  optionText: {
    fontSize: 14,
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

