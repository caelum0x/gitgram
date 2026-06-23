import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { collectionService } from '../../services/collectionService';
import { logger } from '../../utils/logger';

export default function SavedCollectionsScreen() {
  const router = useRouter();
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const response = await collectionService.getCollections();
      setCollections(response.collections || []);
    } catch (error) {
      logger.error('Load collections error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCollection = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.collectionItem}
      onPress={() => router.push(`/collection/${item.id}`)}
    >
      <View style={styles.collectionIcon}>
        <Icon name="folder" size={24} color={Colors.accent} />
      </View>
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName}>{item.name}</Text>
        <Text style={styles.collectionCount}>
          {item.postsCount || 0} posts
        </Text>
      </View>
      <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Collections" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Collections"
        rightIcon="add"
        onRightPress={() => router.push('/collection/create')}
      />
      {collections.length > 0 ? (
        <FlatList
          data={collections}
          renderItem={renderCollection}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No collections"
          message="Create collections to organize your saved posts"
          icon="📁"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  collectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.accentBackground || Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  collectionCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

