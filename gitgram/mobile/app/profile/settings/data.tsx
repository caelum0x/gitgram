import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { logger } from '../../../utils/logger';
import { imageCache } from '../../../hooks/useImageCache';

interface DataStats {
  cacheSize: string;
  cacheSizeBytes: number;
  asyncStorageSize: string;
  asyncStorageSizeBytes: number;
  totalSize: string;
}

// Helper function to format bytes to human-readable size
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Calculate directory size recursively
const getDirectorySize = async (dirUri: string): Promise<number> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists || !dirInfo.isDirectory) {
      return 0;
    }

    const contents = await FileSystem.readDirectoryAsync(dirUri);
    let totalSize = 0;

    for (const item of contents) {
      const itemUri = `${dirUri}/${item}`;
      const itemInfo = await FileSystem.getInfoAsync(itemUri);

      if (itemInfo.exists) {
        if (itemInfo.isDirectory) {
          totalSize += await getDirectorySize(itemUri);
        } else if (itemInfo.size) {
          totalSize += itemInfo.size;
        }
      }
    }

    return totalSize;
  } catch (error) {
    logger.error('Error calculating directory size:', error);
    return 0;
  }
};

// Calculate AsyncStorage size
const getAsyncStorageSize = async (): Promise<number> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    let totalSize = 0;

    for (const key of keys) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        // Calculate size: key length + value length (in bytes, roughly)
        totalSize += key.length + value.length;
      }
    }

    return totalSize;
  } catch (error) {
    logger.error('Error calculating AsyncStorage size:', error);
    return 0;
  }
};

export default function DataUsageScreen() {
  const [stats, setStats] = useState<DataStats>({
    cacheSize: '0 B',
    cacheSizeBytes: 0,
    asyncStorageSize: '0 B',
    asyncStorageSizeBytes: 0,
    totalSize: '0 B',
  });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadDataUsage();
  }, []);

  const loadDataUsage = async () => {
    try {
      setLoading(true);

      // Calculate cache directory size
      const cacheDir = FileSystem.cacheDirectory;
      let cacheSizeBytes = 0;

      if (cacheDir) {
        cacheSizeBytes = await getDirectorySize(cacheDir);
      }

      // Calculate AsyncStorage size
      const asyncStorageSizeBytes = await getAsyncStorageSize();

      // Calculate total
      const totalBytes = cacheSizeBytes + asyncStorageSizeBytes;

      setStats({
        cacheSize: formatBytes(cacheSizeBytes),
        cacheSizeBytes,
        asyncStorageSize: formatBytes(asyncStorageSizeBytes),
        asyncStorageSizeBytes,
        totalSize: formatBytes(totalBytes),
      });
    } catch (error) {
      logger.error('Load data usage error:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearFileSystemCache = async (): Promise<void> => {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return;

    try {
      const contents = await FileSystem.readDirectoryAsync(cacheDir);

      for (const item of contents) {
        const itemUri = `${cacheDir}${item}`;
        try {
          await FileSystem.deleteAsync(itemUri, { idempotent: true });
        } catch (deleteError) {
          // Some files may be in use, skip them
          logger.warn('Could not delete cache item:', item);
        }
      }
    } catch (error) {
      logger.error('Error clearing file system cache:', error);
      throw error;
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached data? This will not affect your login or saved preferences.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              // Clear expo-image cache
              await Image.clearDiskCache();
              await Image.clearMemoryCache();

              // Clear in-memory image cache from useImageCache hook
              imageCache.clear();

              // Clear file system cache
              await clearFileSystemCache();

              // Reload stats
              await loadDataUsage();

              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              logger.error('Clear cache error:', error);
              Alert.alert('Error', 'Failed to clear some cache data. Please try again.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All App Data',
      'This will clear all cached data AND your saved preferences (except login). Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              // Clear expo-image cache
              await Image.clearDiskCache();
              await Image.clearMemoryCache();

              // Clear in-memory image cache
              imageCache.clear();

              // Clear file system cache
              await clearFileSystemCache();

              // Clear AsyncStorage except auth tokens
              const keys = await AsyncStorage.getAllKeys();
              const keysToRemove = keys.filter(
                key => !key.includes('accessToken') &&
                       !key.includes('refreshToken') &&
                       !key.includes('user')
              );
              await AsyncStorage.multiRemove(keysToRemove);

              // Reload stats
              await loadDataUsage();

              Alert.alert('Success', 'All app data cleared successfully');
            } catch (error) {
              logger.error('Clear all data error:', error);
              Alert.alert('Error', 'Failed to clear some data. Please try again.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Data Usage" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Data Usage" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Usage</Text>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Storage Used</Text>
            <Text style={styles.statValue}>{stats.totalSize}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Cache (Images & Files)</Text>
            <Text style={styles.statValue}>{stats.cacheSize}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>App Data</Text>
            <Text style={styles.statValue}>{stats.asyncStorageSize}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manage Storage</Text>
          <Text style={styles.hint}>
            Clearing cache will remove downloaded images and temporary files. Your login and preferences will be preserved.
          </Text>
          <TouchableOpacity
            style={[styles.clearButton, clearing && styles.clearButtonDisabled]}
            onPress={handleClearCache}
            disabled={clearing || stats.cacheSizeBytes === 0}
          >
            {clearing ? (
              <ActivityIndicator color={Colors.text} size="small" />
            ) : (
              <Text style={styles.clearButtonText}>Clear Cache</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clearAllButton, clearing && styles.clearButtonDisabled]}
            onPress={handleClearAllData}
            disabled={clearing}
          >
            {clearing ? (
              <ActivityIndicator color={Colors.error || '#ff4444'} size="small" />
            ) : (
              <Text style={styles.clearAllButtonText}>Clear All App Data</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Saver</Text>
          <Text style={styles.hint}>
            Enable data saver mode to reduce data usage by loading lower quality images and disabling auto-play for videos.
          </Text>
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
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  clearButtonDisabled: {
    opacity: 0.6,
  },
  clearButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  clearAllButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error || '#ff4444',
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  clearAllButtonText: {
    color: Colors.error || '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

