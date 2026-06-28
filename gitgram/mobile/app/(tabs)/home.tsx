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
import AdCard from '../../components/ads/AdCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import TrendingRepoCard from '../../components/proximity/TrendingRepoCard';
import { PostSkeleton } from '../../components/proximity/Skeleton';
import StoriesRow, { StoryUser } from '../../components/proximity/StoriesRow';
import QuickActionSheet from '../../components/proximity/QuickActionSheet';
import { postService } from '../../services/postService';
import { adService } from '../../services/adService';
import repositoryService from '../../services/repositoryService';
import { storyService } from '../../services/storyService';
import { logger } from '../../utils/logger';
import { useRouter } from 'expo-router';

interface TrendingRepo {
  fullName: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  htmlUrl: string;
}

function toStoryUsers(raw: unknown): StoryUser[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): StoryUser | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const user =
        item.user && typeof item.user === 'object'
          ? (item.user as Record<string, unknown>)
          : item;
      const id = user.id;
      const username = user.username;
      if (typeof id !== 'string' || typeof username !== 'string') return null;
      return {
        id,
        username,
        displayName:
          typeof user.displayName === 'string' ? user.displayName : null,
        avatarUrl:
          typeof user.avatar === 'string'
            ? user.avatar
            : typeof user.avatarUrl === 'string'
            ? user.avatarUrl
            : null,
        hasSeen: item.hasSeen === true || user.hasSeen === true,
      };
    })
    .filter((u): u is StoryUser => u !== null);
}

function toTrendingRepo(raw: Record<string, unknown>): TrendingRepo {
  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;
  const asNumber = (value: unknown): number =>
    typeof value === 'number' ? value : 0;

  const fullName =
    asString(raw.fullName) ?? asString(raw.full_name) ?? asString(raw.name) ?? '';

  return {
    fullName,
    description: asString(raw.description),
    language: asString(raw.language),
    stars: asNumber(raw.stars) || asNumber(raw.stargazers_count),
    forks: asNumber(raw.forks) || asNumber(raw.forks_count),
    htmlUrl: asString(raw.htmlUrl) ?? asString(raw.html_url) ?? '',
  };
}

export default function HomeScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [trendingRepos, setTrendingRepos] = useState<any[]>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [ads, setAds] = useState<Map<number, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);

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

  const loadStories = async () => {
    try {
      const response = await storyService.getStories();
      const rawList = response?.stories ?? response?.data ?? response;
      setStoryUsers(toStoryUsers(rawList));
    } catch (error) {
      logger.error('Load stories error:', error);
    }
  };

  const loadPosts = async (pageNum = 1, refresh = false) => {
    try {
      setFeedError(null);
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
      logger.error('Load posts error:', error);
      // Only surface the error when there is nothing to show; pagination
      // failures on an already-populated feed stay silent and are retryable.
      if (refresh || posts.length === 0) {
        setFeedError('Could not load your feed. Pull to refresh or tap retry.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPosts();
    loadTrendingRepos();
    loadStories();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadPosts(1, true);
    loadTrendingRepos();
    loadStories();
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPosts(nextPage);
    }
  };

  if (loading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerIcon}>💻</Text>
            <Text style={styles.headerTitle}>Gitgram</Text>
          </View>
        </View>
        <View style={styles.skeletonList}>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </View>
      </SafeAreaView>
    );
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
      return <TrendingRepoCard repo={toTrendingRepo(item.data as Record<string, unknown>)} />;
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
            onPress={() => setCreateSheetVisible(true)}
            accessibilityLabel="Create"
          >
            <Text style={styles.headerButtonIcon}>➕</Text>
          </TouchableOpacity>
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
        ListHeaderComponent={
          storyUsers.length > 0 ? (
            <StoriesRow
              users={storyUsers}
              onAddStory={() => router.push('/story/create')}
            />
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            feedError ? (
              <EmptyState
                title="Couldn't load your feed"
                message={feedError}
                icon="⚠️"
                actionLabel="Retry"
                onAction={() => {
                  setLoading(true);
                  setPage(1);
                  loadPosts(1, true);
                }}
              />
            ) : (
              <EmptyState
                title="No posts yet"
                message="Start following people to see their posts in your feed"
                icon="📭"
              />
            )
          ) : null
        }
        ListFooterComponent={
          hasMore && posts.length > 0 ? (
            <LoadingSpinner />
          ) : null
        }
      />

      <QuickActionSheet
        visible={createSheetVisible}
        onClose={() => setCreateSheetVisible(false)}
        onSelect={(route) => {
          setCreateSheetVisible(false);
          router.push(route as Parameters<typeof router.push>[0]);
        }}
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
  skeletonList: {
    paddingTop: 12,
  },
});

