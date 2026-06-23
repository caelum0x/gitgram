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
import { settingsService } from '../../../services/settingsService';
import { logger } from '../../../utils/logger';

export default function LanguageSettingsScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const languages = [
    { id: 'en', label: 'English', nativeLabel: 'English' },
    { id: 'es', label: 'Spanish', nativeLabel: 'Español' },
    { id: 'fr', label: 'French', nativeLabel: 'Français' },
    { id: 'de', label: 'German', nativeLabel: 'Deutsch' },
    { id: 'it', label: 'Italian', nativeLabel: 'Italiano' },
    { id: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
    { id: 'ru', label: 'Russian', nativeLabel: 'Русский' },
    { id: 'ja', label: 'Japanese', nativeLabel: '日本語' },
    { id: 'ko', label: 'Korean', nativeLabel: '한국어' },
    { id: 'zh', label: 'Chinese', nativeLabel: '中文' },
  ];

  const handleSelectLanguage = async (languageId: string) => {
    setSelectedLanguage(languageId);
    try {
      await settingsService.updateLanguageSettings({ language: languageId });
      Alert.alert('Success', 'Language updated. Restart app to apply changes.');
    } catch (error) {
      logger.error('Update language error:', error);
      Alert.alert('Error', 'Failed to update language');
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Language Settings" />
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Choose Language</Text>
        {languages.map((language) => (
          <TouchableOpacity
            key={language.id}
            style={[
              styles.languageOption,
              selectedLanguage === language.id && styles.selectedLanguage,
            ]}
            onPress={() => handleSelectLanguage(language.id)}
          >
            <View style={styles.languageInfo}>
              <Text
                style={[
                  styles.languageLabel,
                  selectedLanguage === language.id && styles.selectedLanguageLabel,
                ]}
              >
                {language.label}
              </Text>
              <Text style={styles.languageNative}>{language.nativeLabel}</Text>
            </View>
            {selectedLanguage === language.id && (
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
  languageOption: {
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
  selectedLanguage: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentBackground || Colors.surface,
  },
  languageInfo: {
    flex: 1,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  selectedLanguageLabel: {
    fontWeight: '600',
    color: Colors.accent,
  },
  languageNative: {
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

