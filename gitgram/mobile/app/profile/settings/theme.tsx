import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function ThemeSettingsScreen() {
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'auto'>('auto');

  const themes = [
    { id: 'light', label: 'Light', description: 'Always use light theme' },
    { id: 'dark', label: 'Dark', description: 'Always use dark theme' },
    { id: 'auto', label: 'Auto', description: 'Follow system settings' },
  ];

  const handleSelectTheme = async (themeId: string) => {
    setSelectedTheme(themeId as 'light' | 'dark' | 'auto');
    try {
      await settingsService.updateAppearanceSettings({ theme: themeId });
      Alert.alert('Success', 'Theme updated. Restart app to apply changes.');
    } catch (error) {
      logger.error('Update theme error:', error);
      Alert.alert('Error', 'Failed to update theme');
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Theme Settings" />
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Choose Theme</Text>
        {themes.map((theme) => (
          <TouchableOpacity
            key={theme.id}
            style={[
              styles.themeOption,
              selectedTheme === theme.id && styles.selectedTheme,
            ]}
            onPress={() => handleSelectTheme(theme.id)}
          >
            <View style={styles.themeInfo}>
              <Text
                style={[
                  styles.themeLabel,
                  selectedTheme === theme.id && styles.selectedThemeLabel,
                ]}
              >
                {theme.label}
              </Text>
              <Text style={styles.themeDescription}>{theme.description}</Text>
            </View>
            {selectedTheme === theme.id && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTheme: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentBackground || Colors.surface,
  },
  themeInfo: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  selectedThemeLabel: {
    fontWeight: '600',
    color: Colors.accent,
  },
  themeDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

