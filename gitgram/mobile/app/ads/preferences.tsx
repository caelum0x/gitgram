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
import { adService } from '../../services/adService';

export default function AdPreferencesScreen() {
  const [preferences, setPreferences] = useState({
    showAds: true,
    personalizedAds: true,
    allowDataCollection: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await adService.getPreferences();
      setPreferences(response.preferences || response);
    } catch (error) {
      logger.error('Load ad preferences error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await adService.updatePreferences(preferences);
      Alert.alert('Success', 'Ad preferences saved');
    } catch (error) {
      logger.error('Save ad preferences error:', error);
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const togglePreference = (key: keyof typeof preferences) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Ad Preferences" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        <Text style={styles.description}>
          Control how ads are shown to you and how your data is used for advertising.
        </Text>

        <View style={styles.section}>
          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceLabel}>Show Ads</Text>
              <Text style={styles.preferenceDescription}>
                Allow ads to be displayed in your feed
              </Text>
            </View>
            <Switch
              value={preferences.showAds}
              onValueChange={() => togglePreference('showAds')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceLabel}>Personalized Ads</Text>
              <Text style={styles.preferenceDescription}>
                Show ads based on your interests and activity
              </Text>
            </View>
            <Switch
              value={preferences.personalizedAds}
              onValueChange={() => togglePreference('personalizedAds')}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceLabel}>Data Collection</Text>
              <Text style={styles.preferenceDescription}>
                Allow collection of data for ad targeting
              </Text>
            </View>
            <Switch
              value={preferences.allowDataCollection}
              onValueChange={() => togglePreference('allowDataCollection')}
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
            <Text style={styles.saveButtonText}>Save Preferences</Text>
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
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 16,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  preferenceDescription: {
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

