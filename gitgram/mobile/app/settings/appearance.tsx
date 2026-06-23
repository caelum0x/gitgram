import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { settingsService } from '../../services/settingsService';

export default function AppearanceSettingsScreen() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.getAppearanceSettings();
      if (response.settings) {
        setTheme(response.settings.theme || 'auto');
        setFontSize(response.settings.fontSize || 'medium');
      }
    } catch (error) {
      logger.error('Load appearance settings error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updateAppearanceSettings({
        theme,
        fontSize,
      });
      Alert.alert('Success', 'Appearance settings saved');
    } catch (error) {
      logger.error('Save appearance settings error:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Appearance" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          {(['light', 'dark', 'auto'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.optionButton,
                theme === t && styles.selectedOption,
              ]}
              onPress={() => setTheme(t)}
            >
              <Text
                style={[
                  styles.optionText,
                  theme === t && styles.selectedOptionText,
                ]}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
              {theme === t && (
                <Icon name="check" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Font Size</Text>
          {(['small', 'medium', 'large'] as const).map((size) => (
            <TouchableOpacity
              key={size}
              style={[
                styles.optionButton,
                fontSize === size && styles.selectedOption,
              ]}
              onPress={() => setFontSize(size)}
            >
              <Text
                style={[
                  styles.optionText,
                  fontSize === size && styles.selectedOptionText,
                ]}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </Text>
              {fontSize === size && (
                <Icon name="check" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
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
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedOption: {
    backgroundColor: Colors.accentBackground || Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  optionText: {
    fontSize: 16,
    color: Colors.text,
  },
  selectedOptionText: {
    fontWeight: '600',
    color: Colors.accent,
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

