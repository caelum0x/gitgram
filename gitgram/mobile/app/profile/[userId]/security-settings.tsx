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
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    twoFactorEnabled: false,
    loginAlerts: true,
    suspiciousLoginAlerts: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getPrivacySettings();
      if (response) {
        setSettings((prev) => ({
          ...prev,
          twoFactorEnabled: response.twoFactorEnabled ?? prev.twoFactorEnabled,
          loginAlerts: response.loginAlerts ?? prev.loginAlerts,
          suspiciousLoginAlerts: response.suspiciousLoginAlerts ?? prev.suspiciousLoginAlerts,
        }));
      }
    } catch (error: any) {
      logger.error('Load security settings error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updatePrivacySettings({
        twoFactorEnabled: settings.twoFactorEnabled,
        loginAlerts: settings.loginAlerts,
        suspiciousLoginAlerts: settings.suspiciousLoginAlerts,
      });
      Alert.alert('Success', 'Security settings saved');
    } catch (error: any) {
      logger.error('Save security settings error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to save security settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Security Settings"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Two-Factor Authentication</Text>
            <Text style={styles.settingDescription}>
              Add an extra layer of security to your account
            </Text>
          </View>
          <Switch
            value={settings.twoFactorEnabled}
            onValueChange={(value) => {
              setSettings({ ...settings, twoFactorEnabled: value });
              if (value) {
                router.push('/(auth)/two-factor');
              }
            }}
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Login Alerts</Text>
            <Text style={styles.settingDescription}>
              Get notified when you log in from a new device
            </Text>
          </View>
          <Switch
            value={settings.loginAlerts}
            onValueChange={(value) =>
              setSettings({ ...settings, loginAlerts: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Suspicious Login Alerts</Text>
            <Text style={styles.settingDescription}>
              Get notified about suspicious login attempts
            </Text>
          </View>
          <Switch
            value={settings.suspiciousLoginAlerts}
            onValueChange={(value) =>
              setSettings({ ...settings, suspiciousLoginAlerts: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/settings/password')}
        >
          <Icon name="lock" size={24} color={Colors.text} />
          <Text style={styles.actionLabel}>Change Password</Text>
          <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/settings/active-sessions')}
        >
          <Icon name="devices" size={24} color={Colors.text} />
          <Text style={styles.actionLabel}>Active Sessions</Text>
          <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
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
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginTop: 16,
    gap: 12,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
});

