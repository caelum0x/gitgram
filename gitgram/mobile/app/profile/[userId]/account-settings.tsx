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
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function AccountSettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    privateAccount: false,
    showActivityStatus: true,
    allowComments: true,
    allowLikes: true,
    allowMentions: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getAccountSettings();
      if (response) {
        setSettings((prev) => ({
          ...prev,
          privateAccount: response.privacySettings?.privateAccount ?? prev.privateAccount,
          showActivityStatus: response.privacySettings?.showActivityStatus ?? prev.showActivityStatus,
          allowComments: response.privacySettings?.allowComments ?? prev.allowComments,
          allowLikes: response.privacySettings?.allowLikes ?? prev.allowLikes,
          allowMentions: response.privacySettings?.allowMentions ?? prev.allowMentions,
        }));
      }
    } catch (error: any) {
      logger.error('Load account settings error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updateAccountSettings({
        privacySettings: {
          privateAccount: settings.privateAccount,
          showActivityStatus: settings.showActivityStatus,
          allowComments: settings.allowComments,
          allowLikes: settings.allowLikes,
          allowMentions: settings.allowMentions,
        },
      });
      Alert.alert('Success', 'Account settings saved');
    } catch (error: any) {
      logger.error('Save account settings error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to save account settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Account Settings"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Private Account</Text>
            <Text style={styles.settingDescription}>
              Only approved followers can see your posts
            </Text>
          </View>
          <Switch
            value={settings.privateAccount}
            onValueChange={(value) =>
              setSettings({ ...settings, privateAccount: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Activity Status</Text>
            <Text style={styles.settingDescription}>
              Show when you were last active
            </Text>
          </View>
          <Switch
            value={settings.showActivityStatus}
            onValueChange={(value) =>
              setSettings({ ...settings, showActivityStatus: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Comments</Text>
            <Text style={styles.settingDescription}>
              Allow others to comment on your posts
            </Text>
          </View>
          <Switch
            value={settings.allowComments}
            onValueChange={(value) =>
              setSettings({ ...settings, allowComments: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Likes</Text>
            <Text style={styles.settingDescription}>
              Allow others to like your posts
            </Text>
          </View>
          <Switch
            value={settings.allowLikes}
            onValueChange={(value) =>
              setSettings({ ...settings, allowLikes: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Mentions</Text>
            <Text style={styles.settingDescription}>
              Allow others to mention you in posts
            </Text>
          </View>
          <Switch
            value={settings.allowMentions}
            onValueChange={(value) =>
              setSettings({ ...settings, allowMentions: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
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

