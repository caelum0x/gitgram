import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';

export default function TagReelsScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tag) {
      loadTagReels(tag);
    }
  }, [tag]);

  const loadTagReels = async (tagName: string) => {
    try {
      const response = await reelService.searchReels(`#${tagName}`, 1, 20);
      setReels(response.reels || []);
    } catch (error) {
      logger.error('Load tag reels error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`#${tag} Reels`} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={`#${tag} Reels`} />
      {reels.length > 0 ? (
        <FlatList
          data={reels}
          renderItem={({ item }) => (
            <View style={styles.reelItem}>
              {item.thumbnailUrl && (
                <Image
                  source={{ uri: item.thumbnailUrl }}
                  style={styles.reelThumbnail}
                />
              )}
              <View style={styles.reelInfo}>
                <Text style={styles.reelCaption} numberOfLines={2}>
                  {item.caption}
                </Text>
                <View style={styles.reelStats}>
                  <Text style={styles.stat}>❤️ {item.likesCount || 0}</Text>
                  <Text style={styles.stat}>💬 {item.commentsCount || 0}</Text>
                </View>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title={`No reels with #${tag}`}
          message="Try searching for other tags"
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
  reelItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  reelThumbnail: {
    width: 100,
    height: 150,
    borderRadius: 8,
  },
  reelInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  reelCaption: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
  },
  reelStats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

