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
import { userService } from '../../../services/userService';
import { settingsService } from '../../../services/settingsService';
import { logger } from '../../../utils/logger';

export default function PrivacySettingsScreen() {
  const [settings, setSettings] = useState({
    isPrivate: false,
    showActivityStatus: true,
    allowMessages: true,
    allowComments: true,
    allowTags: true,
    showFollowers: true,
    showFollowing: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getPrivacySettings();
      setSettings(response.settings || response);
    } catch (error) {
      logger.error('Load privacy settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await settingsService.updatePrivacySettings(settings);
      Alert.alert('Success', 'Privacy settings saved');
    } catch (error) {
      logger.error('Save privacy settings error:', error);
      Alert.alert('Error', 'Failed to save privacy settings');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Privacy Settings" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Privacy Settings" rightIcon="check" onRightPress={handleSave} />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Privacy</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Private Account</Text>
              <Text style={styles.settingDescription}>
                Only approved followers can see your posts and stories
              </Text>
            </View>
            <Switch
              value={settings.isPrivate}
              onValueChange={() => toggleSetting('isPrivate')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Status</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Activity Status</Text>
              <Text style={styles.settingDescription}>
                Allow others to see when you're active
              </Text>
            </View>
            <Switch
              value={settings.showActivityStatus}
              onValueChange={() => toggleSetting('showActivityStatus')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Messages</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Messages</Text>
              <Text style={styles.settingDescription}>
                Allow others to send you messages
              </Text>
            </View>
            <Switch
              value={settings.allowMessages}
              onValueChange={() => toggleSetting('allowMessages')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comments</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Comments</Text>
              <Text style={styles.settingDescription}>
                Allow others to comment on your posts
              </Text>
            </View>
            <Switch
              value={settings.allowComments}
              onValueChange={() => toggleSetting('allowComments')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Tags</Text>
              <Text style={styles.settingDescription}>
                Allow others to tag you in posts
              </Text>
            </View>
            <Switch
              value={settings.allowTags}
              onValueChange={() => toggleSetting('allowTags')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Visibility</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Followers</Text>
              <Text style={styles.settingDescription}>
                Show your followers list on your profile
              </Text>
            </View>
            <Switch
              value={settings.showFollowers}
              onValueChange={() => toggleSetting('showFollowers')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Show Following</Text>
              <Text style={styles.settingDescription}>
                Show who you're following on your profile
              </Text>
            </View>
            <Switch
              value={settings.showFollowing}
              onValueChange={() => toggleSetting('showFollowing')}
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

