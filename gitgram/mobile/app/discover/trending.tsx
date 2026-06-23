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
import PostCard from '../../components/Post/PostCard';
import { postService } from '../../services/postService';
import { logger } from '../../utils/logger';

export default function TrendingScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    loadTrending();
  }, [timeframe]);

  const loadTrending = async () => {
    try {
      const response = await postService.getTrending(timeframe, 1, 20);
      setPosts(response.posts || []);
    } catch (error) {
      logger.error('Load trending error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Trending" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Trending" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, timeframe === 'today' && styles.activeTab]}
          onPress={() => setTimeframe('today')}
        >
          <Text
            style={[
              styles.tabText,
              timeframe === 'today' && styles.activeTabText,
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, timeframe === 'week' && styles.activeTab]}
          onPress={() => setTimeframe('week')}
        >
          <Text
            style={[
              styles.tabText,
              timeframe === 'week' && styles.activeTabText,
            ]}
          >
            This Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, timeframe === 'month' && styles.activeTab]}
          onPress={() => setTimeframe('month')}
        >
          <Text
            style={[
              styles.tabText,
              timeframe === 'month' && styles.activeTabText,
            ]}
          >
            This Month
          </Text>
        </TouchableOpacity>
      </View>

      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={({ item }) => (
            <PostCard post={item} onPress={() => router.push(`/post/${item.id}`)} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No trending posts"
          message="Check back later for trending content!"
          icon="🔥"
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.text,
  },
  listContent: {
    paddingBottom: 20,
  },
});

