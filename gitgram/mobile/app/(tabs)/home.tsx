import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import PostCard from '../../components/Post/PostCard';
import RepoCard from '../../components/Repo/RepoCard';
import AdCard from '../../components/ads/AdCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { postService } from '../../services/postService';
import { adService } from '../../services/adService';
import repositoryService from '../../services/repositoryService';
import { logger } from '../../utils/logger';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [trendingRepos, setTrendingRepos] = useState<any[]>([]);
  const [ads, setAds] = useState<Map<number, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadAds = async (feedPosition: number) => {
    try {
      if (feedPosition % 5 === 0) {
        const response = await adService.getFeedAds(feedPosition, 'feed', 1);
        if (response.ads && response.ads.length > 0) {
          setAds((prev) => new Map(prev).set(feedPosition, response.ads[0]));
        }
      }
    } catch (error) {
      logger.error('Load ads error:', error);
    }
  };

  const loadTrendingRepos = async () => {
    try {
      const response = await repositoryService.getTrending();
      setTrendingRepos(response.repositories?.slice(0, 3) || []);
    } catch (error) {
      logger.error('Load trending repos error:', error);
    }
  };

  const loadPosts = async (pageNum = 1, refresh = false) => {
    try {
      const response = await postService.getPosts(pageNum, 10);
      const newPosts = response.posts || [];

      if (refresh) {
        setPosts(newPosts);
        setAds(new Map());
        // Load ads for initial positions
        newPosts.forEach((_: any, index: number) => {
          if ((index + 1) % 5 === 0) {
            loadAds(index + 1);
          }
        });
      } else {
        setPosts(prev => {
          const updated = [...prev, ...newPosts];
          // Load ads for new positions
          newPosts.forEach((_: any, index: number) => {
            const position = prev.length + index + 1;
            if (position % 5 === 0) {
              loadAds(position);
            }
          });
          return updated;
        });
      }
      setHasMore(response.pagination.page < response.pagination.pages);
    } catch (error) {
      // Error handled silently, user can retry
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPosts();
    loadTrendingRepos();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadPosts(1, true);
    loadTrendingRepos();
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPosts(nextPage);
    }
  };

  if (loading && posts.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  // Combine posts, repos, and ads into a single feed array
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'post' | 'ad' | 'repo'; data: any; index: number }> = [];

    // Add trending repos at the start
    trendingRepos.forEach((repo, idx) => {
      items.push({ type: 'repo', data: repo, index: idx });
    });

    posts.forEach((post, index) => {
      const position = index + 1 + trendingRepos.length;

      items.push({ type: 'post', data: post, index: position });

      if (position % 5 === 0 && ads.has(position)) {
        items.push({ type: 'ad', data: ads.get(position), index: position });
      }
    });

    return items;
  }, [posts, ads, trendingRepos]);

  const renderItem = useCallback(({ item }: { item: { type: 'post' | 'ad' | 'repo'; data: any; index: number } }) => {
    if (item.type === 'ad') {
      return <AdCard ad={item.data} />;
    }
    if (item.type === 'repo') {
      return <RepoCard repo={item.data} />;
    }
    return <PostCard post={item.data} />;
  }, []);

  const keyExtractor = useCallback((item: { type: 'post' | 'ad' | 'repo'; data: any; index: number }) => {
    if (item.type === 'ad') return `ad-${item.data.id}`;
    if (item.type === 'repo') return `repo-${item.data.id || item.data.fullName}`;
    return item.data.id;
  }, []);

  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>💻</Text>
          <Text style={styles.headerTitle}>Gitgram</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/notifications')}
          >
            <Text style={styles.headerButtonIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/messages')}
          >
            <Text style={styles.headerButtonIcon}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Feed */}
      <FlatList
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No posts yet"
              message="Start following people to see their posts in your feed"
              icon="📭"
            />
          ) : null
        }
        ListFooterComponent={
          hasMore && posts.length > 0 ? (
            <LoadingSpinner />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerButtonIcon: {
    fontSize: 20,
  },
  listContent: {
    paddingBottom: 80, // Space for bottom tab bar
  },
});

