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
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState({
    likes: true,
    comments: true,
    follows: true,
    messages: true,
    mentions: true,
    storyReactions: true,
    postShares: true,
    reelShares: true,
    pushNotifications: true,
    emailNotifications: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getNotificationPreferences();
      if (response.preferences) {
        setSettings({
          likes: response.preferences.likes ?? true,
          comments: response.preferences.comments ?? true,
          follows: response.preferences.follows ?? true,
          messages: response.preferences.messages ?? true,
          mentions: response.preferences.mentions ?? true,
          storyReactions: response.preferences.storyReactions ?? true,
          postShares: response.preferences.postShares ?? true,
          reelShares: response.preferences.reelShares ?? true,
          pushNotifications: response.preferences.pushNotifications ?? true,
          emailNotifications: response.preferences.emailNotifications ?? false,
        });
      }
    } catch (error) {
      logger.error('Load notification settings error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updateNotificationPreferences(settings);
      Alert.alert('Success', 'Notification settings saved');
    } catch (error) {
      logger.error('Save notification settings error:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Notifications" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Likes</Text>
              <Text style={styles.settingDescription}>
                Notify when someone likes your post
              </Text>
            </View>
            <Switch
              value={settings.likes}
              onValueChange={() => toggleSetting('likes')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Comments</Text>
              <Text style={styles.settingDescription}>
                Notify when someone comments on your post
              </Text>
            </View>
            <Switch
              value={settings.comments}
              onValueChange={() => toggleSetting('comments')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Follows</Text>
              <Text style={styles.settingDescription}>
                Notify when someone follows you
              </Text>
            </View>
            <Switch
              value={settings.follows}
              onValueChange={() => toggleSetting('follows')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Mentions</Text>
              <Text style={styles.settingDescription}>
                Notify when someone mentions you
              </Text>
            </View>
            <Switch
              value={settings.mentions}
              onValueChange={() => toggleSetting('mentions')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Story Reactions</Text>
              <Text style={styles.settingDescription}>
                Notify when someone reacts to your story
              </Text>
            </View>
            <Switch
              value={settings.storyReactions}
              onValueChange={() => toggleSetting('storyReactions')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Post Shares</Text>
              <Text style={styles.settingDescription}>
                Notify when someone shares your post
              </Text>
            </View>
            <Switch
              value={settings.postShares}
              onValueChange={() => toggleSetting('postShares')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Reel Shares</Text>
              <Text style={styles.settingDescription}>
                Notify when someone shares your reel
              </Text>
            </View>
            <Switch
              value={settings.reelShares}
              onValueChange={() => toggleSetting('reelShares')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>
                Receive push notifications on your device
              </Text>
            </View>
            <Switch
              value={settings.pushNotifications}
              onValueChange={() => toggleSetting('pushNotifications')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Email Notifications</Text>
              <Text style={styles.settingDescription}>
                Receive notifications via email
              </Text>
            </View>
            <Switch
              value={settings.emailNotifications}
              onValueChange={() => toggleSetting('emailNotifications')}
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

