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
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AppSettingsScreen() {
  const [settings, setSettings] = useState({
    autoPlayVideos: true,
    highQualityImages: false,
    saveOriginalPhotos: false,
    reduceMotion: false,
    hapticFeedback: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('appSettings');
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (error) {
      logger.error('Load app settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await AsyncStorage.setItem('appSettings', JSON.stringify(settings));
      Alert.alert('Success', 'App settings saved');
    } catch (error) {
      logger.error('Save app settings error:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="App Settings" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="App Settings" rightIcon="check" onRightPress={handleSave} />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Media</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-play Videos</Text>
              <Text style={styles.settingDescription}>
                Automatically play videos in feed
              </Text>
            </View>
            <Switch
              value={settings.autoPlayVideos}
              onValueChange={() => toggleSetting('autoPlayVideos')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>High Quality Images</Text>
              <Text style={styles.settingDescription}>
                Load images in higher quality (uses more data)
              </Text>
            </View>
            <Switch
              value={settings.highQualityImages}
              onValueChange={() => toggleSetting('highQualityImages')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Save Original Photos</Text>
              <Text style={styles.settingDescription}>
                Save original quality photos to device
              </Text>
            </View>
            <Switch
              value={settings.saveOriginalPhotos}
              onValueChange={() => toggleSetting('saveOriginalPhotos')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accessibility</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Reduce Motion</Text>
              <Text style={styles.settingDescription}>
                Reduce animations and motion effects
              </Text>
            </View>
            <Switch
              value={settings.reduceMotion}
              onValueChange={() => toggleSetting('reduceMotion')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interaction</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
              <Text style={styles.settingDescription}>
                Enable haptic feedback for interactions
              </Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={() => toggleSetting('hapticFeedback')}
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

