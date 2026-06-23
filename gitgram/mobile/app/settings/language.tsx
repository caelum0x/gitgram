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
import { settingsService } from '../../services/settingsService';
import Icon from 'react-native-vector-icons/MaterialIcons';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

export default function LanguageSettingsScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const response = await settingsService.getLanguageSettings();
      if (response.language) {
        setSelectedLanguage(response.language);
      }
    } catch (error) {
      logger.error('Load language error:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsService.updateLanguageSettings({ language: selectedLanguage });
      Alert.alert('Success', 'Language preference saved');
    } catch (error) {
      logger.error('Save language error:', error);
      Alert.alert('Error', 'Failed to save language');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Language" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.languageItem,
              selectedLanguage === lang.code && styles.selectedLanguage,
            ]}
            onPress={() => setSelectedLanguage(lang.code)}
          >
            <Text
              style={[
                styles.languageName,
                selectedLanguage === lang.code && styles.selectedLanguageText,
              ]}
            >
              {lang.name}
            </Text>
            {selectedLanguage === lang.code && (
              <Icon name="check" size={20} color={Colors.accent} />
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.saveButtonText}>Save Language</Text>
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
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedLanguage: {
    backgroundColor: Colors.accentBackground || Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  languageName: {
    fontSize: 16,
    color: Colors.text,
  },
  selectedLanguageText: {
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

