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
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { settingsService } from '../../services/settingsService';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState({
    twoFactorEnabled: false,
    loginAlerts: true,
    suspiciousActivityAlerts: true,
    sessionManagement: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSecuritySettings();
  }, []);

  const loadSecuritySettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getAccountSettings();
      if (response.settings) {
        setSettings({
          twoFactorEnabled: response.settings.twoFactorEnabled || false,
          loginAlerts: response.settings.loginAlerts ?? true,
          suspiciousActivityAlerts: response.settings.suspiciousActivityAlerts ?? true,
          sessionManagement: response.settings.sessionManagement ?? true,
        });
      }
    } catch (error) {
      logger.error('Load security settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await settingsService.updateAccountSettings({
        privacySettings: {
        twoFactorEnabled: settings.twoFactorEnabled,
          loginAlerts: settings.loginAlerts,
          suspiciousActivityAlerts: settings.suspiciousActivityAlerts,
          sessionManagement: settings.sessionManagement,
        },
      } as any);
      Alert.alert('Success', 'Security settings saved');
    } catch (error) {
      logger.error('Save security settings error:', error);
      Alert.alert('Error', 'Failed to save security settings');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Security" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Security" rightIcon="check" onRightPress={handleSave} />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Two-Factor Authentication</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable 2FA</Text>
              <Text style={styles.settingDescription}>
                Add an extra layer of security to your account
              </Text>
            </View>
            <Switch
              value={settings.twoFactorEnabled}
              onValueChange={() => toggleSetting('twoFactorEnabled')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
          {settings.twoFactorEnabled && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/account/security/2fa-setup')}
            >
              <Text style={styles.actionButtonText}>Setup 2FA</Text>
              <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Login Alerts</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Email Notifications</Text>
              <Text style={styles.settingDescription}>
                Get notified when someone logs into your account
              </Text>
            </View>
            <Switch
              value={settings.loginAlerts}
              onValueChange={() => toggleSetting('loginAlerts')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Monitoring</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Suspicious Activity Alerts</Text>
              <Text style={styles.settingDescription}>
                Get notified about unusual account activity
              </Text>
            </View>
            <Switch
              value={settings.suspiciousActivityAlerts}
              onValueChange={() => toggleSetting('suspiciousActivityAlerts')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sessions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/account/security/sessions')}
          >
            <Text style={styles.actionButtonText}>Active Sessions</Text>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={() => router.push('/account/delete')}
          >
            <Text style={styles.dangerButtonText}>Delete Account</Text>
            <Icon name="delete" size={24} color={Colors.error || '#ff4444'} />
          </TouchableOpacity>
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
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginTop: 12,
  },
  actionButtonText: {
    fontSize: 16,
    color: Colors.text,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error || '#ff4444',
  },
  dangerButtonText: {
    fontSize: 16,
    color: Colors.error || '#ff4444',
    fontWeight: '600',
  },
});

