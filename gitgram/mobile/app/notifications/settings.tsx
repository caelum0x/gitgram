import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { notificationService } from '../../services/notificationService';
import { logger } from '../../utils/logger';
import { settingsService } from '../../services/settingsService';

export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState({
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    messages: true,
    posts: true,
    reels: true,
    stories: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getNotificationPreferences();
      if (response.preferences) {
        setSettings({
          likes: response.preferences.likes ?? true,
          comments: response.preferences.comments ?? true,
          follows: response.preferences.follows ?? true,
          mentions: response.preferences.mentions ?? true,
          messages: response.preferences.messages ?? true,
          posts: response.preferences.postShares ?? true,
          reels: response.preferences.reelShares ?? true,
          stories: response.preferences.storyReactions ?? true,
        });
      }
    } catch (error) {
      logger.error('Load notification settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await settingsService.updateNotificationPreferences({
        likes: settings.likes,
        comments: settings.comments,
        follows: settings.follows,
        mentions: settings.mentions,
        messages: settings.messages,
        pushEnabled: true,
      });
      Alert.alert('Success', 'Notification preferences saved');
    } catch (error) {
      logger.error('Save notification settings error:', error);
      Alert.alert('Error', 'Failed to save preferences');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Notification Settings" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Notification Settings"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Likes</Text>
              <Text style={styles.settingDescription}>
                Get notified when someone likes your post
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
                Get notified when someone comments on your post
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
                Get notified when someone follows you
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
                Get notified when someone mentions you
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
              <Text style={styles.settingLabel}>Messages</Text>
              <Text style={styles.settingDescription}>
                Get notified when you receive a message
              </Text>
            </View>
            <Switch
              value={settings.messages}
              onValueChange={() => toggleSetting('messages')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>New Posts</Text>
              <Text style={styles.settingDescription}>
                Get notified when people you follow post
              </Text>
            </View>
            <Switch
              value={settings.posts}
              onValueChange={() => toggleSetting('posts')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>New Reels</Text>
              <Text style={styles.settingDescription}>
                Get notified when people you follow post reels
              </Text>
            </View>
            <Switch
              value={settings.reels}
              onValueChange={() => toggleSetting('reels')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Stories</Text>
              <Text style={styles.settingDescription}>
                Get notified when people you follow post stories
              </Text>
            </View>
            <Switch
              value={settings.stories}
              onValueChange={() => toggleSetting('stories')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>
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
});

