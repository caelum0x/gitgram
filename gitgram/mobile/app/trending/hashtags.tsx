import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { trendingService, TrendingHashtag } from '../../services/trendingService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function TrendingHashtagsScreen() {
  const router = useRouter();
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrendingHashtags = useCallback(async () => {
    try {
      const response = await trendingService.getTrendingHashtags(50);
      // Normalize response - could be array or object with hashtags
      const hashtagList = Array.isArray(response) ? response : (response as any).hashtags || [];
      setHashtags(hashtagList);
    } catch (error) {
      logger.error('Load trending hashtags error:', error);
      // Fallback to popular hashtags endpoint
      try {
        const fallbackResponse = await trendingService.getPopularHashtags(50);
        setHashtags(fallbackResponse.hashtags || []);
      } catch (fallbackError) {
        logger.error('Fallback popular hashtags error:', fallbackError);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTrendingHashtags();
  }, [loadTrendingHashtags]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadTrendingHashtags();
  };

  const renderHashtag = ({ item, index }: { item: TrendingHashtag; index: number }) => {
    const postCount = item._count?.posts || item.count || 0;
    const tagName = item.name.startsWith('#') ? item.name : `#${item.name}`;

    return (
      <TouchableOpacity
        style={styles.hashtagItem}
        onPress={() => router.push(`/hashtag/${item.name.replace('#', '')}`)}
      >
        <View style={styles.rank}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <Icon name="tag" size={24} color={Colors.accent} />
        <View style={styles.hashtagInfo}>
          <Text style={styles.hashtagName}>{tagName}</Text>
          <Text style={styles.hashtagCount}>
            {postCount} {postCount === 1 ? 'post' : 'posts'}
          </Text>
        </View>
        <Icon name="trending-up" size={20} color={Colors.accent} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Trending Hashtags" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Trending Hashtags" />
      <FlatList
        data={hashtags}
        renderItem={renderHashtag}
        keyExtractor={(item) => item.id || item.name}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No trending hashtags"
            message="Check back later for trending hashtags!"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  hashtagInfo: {
    flex: 1,
  },
  hashtagName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  hashtagCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
