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
import { logger } from '../../utils/logger';
import { hashtagService } from '../../services/hashtagService';

export default function TrendingHashtagsScreen() {
  const router = useRouter();
  const [hashtags, setHashtags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrendingHashtags();
  }, []);

  const loadTrendingHashtags = async () => {
    try {
      const response = await hashtagService.getTrendingHashtags(50);
      setHashtags(response.hashtags || []);
    } catch (error) {
      logger.error('Load trending hashtags error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderHashtag = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.hashtagItem}
      onPress={() => router.push(`/hashtag/${item.tag}`)}
    >
      <View style={styles.hashtagInfo}>
        <Text style={styles.hashtagText}>#{item.tag}</Text>
        <Text style={styles.postsCount}>
          {item.postsCount.toLocaleString()} posts
        </Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );

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
      {hashtags.length > 0 ? (
        <FlatList
          data={hashtags}
          renderItem={renderHashtag}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No trending hashtags"
          message="Hashtags will appear here as they trend"
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
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hashtagInfo: {
    flex: 1,
  },
  hashtagText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.accent,
    marginBottom: 4,
  },
  postsCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  arrow: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
});

