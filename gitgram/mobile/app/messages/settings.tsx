import React, { useState } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../utils/logger';
import { messageService } from '../../services/messageService';

export default function MessageSettingsScreen() {
  const [settings, setSettings] = useState({
    readReceipts: true,
    showTypingIndicator: true,
    allowMessageRequests: true,
    muteNotifications: false,
  });

  const handleSave = async () => {
    try {
      await messageService.updateMessageSettings(settings);
      Alert.alert('Success', 'Settings saved');
    } catch (error) {
      logger.error('Save message settings error:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Message Settings"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Read Receipts</Text>
            <Text style={styles.settingDescription}>
              Show when messages are read
            </Text>
          </View>
          <Switch
            value={settings.readReceipts}
            onValueChange={(value) =>
              setSettings({ ...settings, readReceipts: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Typing Indicator</Text>
            <Text style={styles.settingDescription}>
              Show when others are typing
            </Text>
          </View>
          <Switch
            value={settings.showTypingIndicator}
            onValueChange={(value) =>
              setSettings({ ...settings, showTypingIndicator: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Message Requests</Text>
            <Text style={styles.settingDescription}>
              Allow people to send you message requests
            </Text>
          </View>
          <Switch
            value={settings.allowMessageRequests}
            onValueChange={(value) =>
              setSettings({ ...settings, allowMessageRequests: value })
            }
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Mute Notifications</Text>
            <Text style={styles.settingDescription}>
              Disable message notifications
            </Text>
          </View>
          <Switch
            value={settings.muteNotifications}
            onValueChange={(value) =>
              setSettings({ ...settings, muteNotifications: value })
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

