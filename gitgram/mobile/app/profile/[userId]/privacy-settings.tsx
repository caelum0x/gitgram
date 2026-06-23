import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function PrivacySettingsScreen() {
  const [settings, setSettings] = useState({
    showEmail: false,
    showPhone: false,
    allowTagging: true,
    allowSharing: true,
    showFollowers: true,
    showFollowing: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrivacySettings();
  }, []);

  const fetchPrivacySettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getPrivacySettings();
      if (response?.data) {
        setSettings({
          showEmail: response.data.showEmail ?? false,
          showPhone: response.data.showPhone ?? false,
          allowTagging: response.data.allowTagging ?? true,
          allowSharing: response.data.allowSharing ?? true,
          showFollowers: response.data.showFollowers ?? true,
          showFollowing: response.data.showFollowing ?? true,
        });
      }
    } catch (error) {
      logger.error('Failed to fetch privacy settings:', error);
      Alert.alert('Error', 'Failed to load privacy settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await settingsService.updatePrivacySettings({
        showEmail: settings.showEmail,
        showPhone: settings.showPhone,
        allowTagging: settings.allowTagging,
        allowSharing: settings.allowSharing,
        showFollowers: settings.showFollowers,
        showFollowing: settings.showFollowing,
      });
      logger.log('Privacy settings saved successfully');
      Alert.alert('Success', 'Privacy settings saved successfully.');
    } catch (error) {
      logger.error('Failed to save privacy settings:', error);
      Alert.alert('Error', 'Failed to save privacy settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Privacy Settings" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Privacy Settings"
        rightIcon={saving ? undefined : "check"}
        rightComponent={saving ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : undefined}
        onRightPress={saving ? undefined : handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Email</Text>
            <Text style={styles.settingDescription}>
              Make your email visible to others
            </Text>
          </View>
          <Switch
            value={settings.showEmail}
            onValueChange={(value) =>
              setSettings({ ...settings, showEmail: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Phone</Text>
            <Text style={styles.settingDescription}>
              Make your phone number visible to others
            </Text>
          </View>
          <Switch
            value={settings.showPhone}
            onValueChange={(value) =>
              setSettings({ ...settings, showPhone: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Tagging</Text>
            <Text style={styles.settingDescription}>
              Allow others to tag you in posts
            </Text>
          </View>
          <Switch
            value={settings.allowTagging}
            onValueChange={(value) =>
              setSettings({ ...settings, allowTagging: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Sharing</Text>
            <Text style={styles.settingDescription}>
              Allow others to share your posts
            </Text>
          </View>
          <Switch
            value={settings.allowSharing}
            onValueChange={(value) =>
              setSettings({ ...settings, allowSharing: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Followers</Text>
            <Text style={styles.settingDescription}>
              Make your followers list public
            </Text>
          </View>
          <Switch
            value={settings.showFollowers}
            onValueChange={(value) =>
              setSettings({ ...settings, showFollowers: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show Following</Text>
            <Text style={styles.settingDescription}>
              Make your following list public
            </Text>
          </View>
          <Switch
            value={settings.showFollowing}
            onValueChange={(value) =>
              setSettings({ ...settings, showFollowing: value })
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textSecondary,
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

