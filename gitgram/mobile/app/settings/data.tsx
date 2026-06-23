import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { settingsService } from '../../services/settingsService';
import { Alert } from 'react-native';

export default function DataSettingsScreen() {
  const router = useRouter();

  const options = [
    {
      id: 'export',
      label: 'Export Your Data',
      description: 'Download a copy of your data',
      icon: 'download',
      onPress: () => router.push('/backup/export'),
    },
    {
      id: 'import',
      label: 'Import Data',
      description: 'Import data from a backup',
      icon: 'upload',
      onPress: () => router.push('/backup/import'),
    },
    {
      id: 'clear-cache',
      label: 'Clear Cache',
      description: 'Clear cached data to free up space',
      icon: 'delete-outline',
      onPress: async () => {
        Alert.alert(
          'Clear Cache',
          'Are you sure you want to clear cached data?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear',
              style: 'destructive',
              onPress: async () => {
                try {
                  await settingsService.updateDataSettings({ clearCache: true });
                  Alert.alert('Success', 'Cache cleared successfully');
                } catch (error) {
                  Alert.alert('Error', 'Failed to clear cache');
                }
              },
            },
          ]
        );
      },
    },
    {
      id: 'download-history',
      label: 'Download History',
      description: 'View your download history',
      icon: 'history',
      onPress: async () => {
        try {
          const response = await settingsService.getDataSettings();
          // Navigate to download history screen or show in modal
          Alert.alert('Download History', `You have ${response.downloadHistory?.length || 0} downloads`);
        } catch (error) {
          Alert.alert('Error', 'Failed to load download history');
        }
      },
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <Header title="Data & Storage" />
      <View style={styles.content}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.optionItem}
            onPress={option.onPress}
          >
            <Icon name={option.icon} size={24} color={Colors.accent} />
            <View style={styles.optionInfo}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}
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
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

