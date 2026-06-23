import React, { useState, useEffect } from 'react';
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
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../../services/settingsService';

export default function StorageScreen() {
  const [storage, setStorage] = useState({
    total: '64 GB',
    used: '12.5 GB',
    available: '51.5 GB',
    appSize: '245 MB',
    cache: '89 MB',
    media: '8.2 GB',
    documents: '1.1 GB',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorage();
  }, []);

  const loadStorage = async () => {
    try {
      const response = await settingsService.getDataSettings();
      if (response.storage) {
        setStorage(response.storage);
      }
    } catch (error) {
      logger.error('Load storage error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await settingsService.updateDataSettings({ clearCache: true });
              await loadStorage();
              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              logger.error('Clear cache error:', error);
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Storage" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Storage" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Storage</Text>
          <View style={styles.storageBar}>
            <View style={styles.storageBarBackground}>
              <View
                style={[
                  styles.storageBarFill,
                  { width: `${(parseFloat(storage.used) / parseFloat(storage.total)) * 100}%` },
                ]}
              />
            </View>
            <View style={styles.storageInfo}>
              <Text style={styles.storageText}>
                {storage.used} of {storage.total} used
              </Text>
              <Text style={styles.storageText}>{storage.available} available</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Storage</Text>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>App Size</Text>
            <Text style={styles.statValue}>{storage.appSize}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Cache</Text>
            <Text style={styles.statValue}>{storage.cache}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Media</Text>
            <Text style={styles.statValue}>{storage.media}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Documents</Text>
            <Text style={styles.statValue}>{storage.documents}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearCache}
          >
            <Text style={styles.clearButtonText}>Clear Cache</Text>
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
  storageBar: {
    marginBottom: 16,
  },
  storageBarBackground: {
    height: 8,
    backgroundColor: Colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  storageBarFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  storageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.accent,
  },
  clearButton: {
    backgroundColor: Colors.error || '#ff4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  clearButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

