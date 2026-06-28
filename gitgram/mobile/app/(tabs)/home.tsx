import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import PostCard from '../../components/Post/PostCard';
import AdCard from '../../components/ads/AdCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadLatestButton from '../../components/common/LoadLatestButton';
import EmptyState from '../../components/common/EmptyState';
import TrendingRepoCard from '../../components/proximity/TrendingRepoCard';
import { PostSkeleton } from '../../components/proximity/Skeleton';
import StoriesRow, { StoryUser } from '../../components/proximity/StoriesRow';
import QuickActionSheet from '../../components/proximity/QuickActionSheet';
import { postService } from '../../services/postService';
import { adService } from '../../services/adService';
import repositoryService from '../../services/repositoryService';
import { storyService } from '../../services/storyService';
import { usePostViewTracking } from '../../hooks/usePostViewTracking';
import {
  useMinimalShell,
  useMinimalHeaderStyle,
} from '../../hooks/useMinimalShell';
import { listenSoftReset } from '../../utils/events';
import { logger } from '../../utils/logger';
import { useRouter } from 'expo-router';

type FeedItem = { type: 'post' | 'ad' | 'repo'; data: any; index: number };

// Distance (px) the user must scroll down before the "load latest" pill appears.
const LOAD_LATEST_OFFSET = 320;

// Height of the top app bar; the minimal-shell header collapses by this much.
const HEADER_HEIGHT = 56;

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
  const [scrolledDown, setScrolledDown] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);

  const listRef = useRef<FlatList<FeedItem>>(null);
  // Newest post id currently shown at the top of the feed, used to detect when
  // a background poll surfaces fresher content.
  const newestPostIdRef = useRef<string | null>(null);

  // Hide-on-scroll: collapse the header (and bottom tab bar) on downward
  // scroll, reveal on upward scroll. Shared with the tab bar via a singleton.
  const minimalShell = useMinimalShell();
  const headerAnimStyle = useMinimalHeaderStyle(HEADER_HEIGHT);

  const { onViewableItemsChanged, reset: resetViewTracking } =
    usePostViewTracking<FeedItem>({
      logContext: 'home-feed',
      getPostId: (item) =>
        item.type === 'post' && typeof item.data?.id === 'string'
          ? item.data.id
          : null,
    });

  // viewabilityConfig must be stable for the lifetime of the FlatList.
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 250,
  });

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
        // A refresh swaps the feed, so reset impression dedupe and clear the
        // "new posts" indicator, anchoring on the freshest visible post id.
        resetViewTracking();
        setNewPostCount(0);
        if (newPosts.length > 0 && typeof newPosts[0]?.id === 'string') {
          newestPostIdRef.current = newPosts[0].id;
        }
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

  // Scroll the feed to the top and reload the latest posts. Shared by the
  // "load latest" pill and the soft-reset (re-press active tab) gesture.
  const scrollToTopAndRefresh = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setScrolledDown(false);
    minimalShell.reveal();
    handleRefresh();
  }, [minimalShell]);

  // Soft reset: re-pressing the Home tab scrolls to top and reloads.
  useEffect(() => {
    const unlisten = listenSoftReset(scrollToTopAndRefresh);
    return unlisten;
  }, [scrollToTopAndRefresh]);

  // Lightweight background poll for fresher content. Compares the newest post
  // id against what is currently anchored at the top of the feed.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await postService.getPosts(1, 5);
        const latest = response.posts || [];
        const anchor = newestPostIdRef.current;
        if (!anchor) {
          return;
        }
        const anchorIndex = latest.findIndex(
          (p: any) => p?.id === anchor,
        );
        // Posts ahead of the anchor are new arrivals. If the anchor fell off
        // the first page entirely, treat the whole page as new.
        const count = anchorIndex === -1 ? latest.length : anchorIndex;
        if (count > 0) {
          setNewPostCount(count);
        }
      } catch (error) {
        logger.error('Poll latest posts error:', error);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      setScrolledDown((prev) => {
        const next = offsetY > LOAD_LATEST_OFFSET;
        return prev === next ? prev : next;
      });
      // Drive the collapsing header + tab bar.
      minimalShell.onScroll(event);
    },
    [minimalShell],
  );

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
    const items: FeedItem[] = [];

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

  // Remove a post the viewer hid ("Not interested") or whose author they
  // blocked, so it disappears from the feed immediately.
  const handleHidePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p?.id !== postId));
  }, []);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item.type === 'ad') {
      return <AdCard ad={item.data} />;
    }
    if (item.type === 'repo') {
      return <TrendingRepoCard repo={toTrendingRepo(item.data as Record<string, unknown>)} />;
    }
    return <PostCard post={item.data} onHide={handleHidePost} />;
  }, [handleHidePost]);

  const keyExtractor = useCallback((item: FeedItem) => {
    if (item.type === 'ad') return `ad-${item.data.id}`;
    if (item.type === 'repo') return `repo-${item.data.id || item.data.fullName}`;
    return item.data.id;
  }, []);

  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top App Bar — collapses on downward scroll (minimal shell). */}
      <Animated.View style={[styles.header, styles.headerAbsolute, headerAnimStyle]}>
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
      </Animated.View>

      {/* Main Content Feed */}
      <View style={styles.feedContainer}>
      <LoadLatestButton
        visible={scrolledDown || newPostCount > 0}
        showIndicator={newPostCount > 0}
        label={newPostCount > 0 ? String(newPostCount) : undefined}
        onPress={scrollToTopAndRefresh}
      />
      <FlatList
        ref={listRef}
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfigRef.current}
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
      </View>

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
    height: HEADER_HEIGHT,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  // Absolutely positioned so collapsing it reclaims vertical feed space; the
  // list compensates with matching top padding.
  headerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
  feedContainer: {
    flex: 1,
    position: 'relative',
  },
  listContent: {
    paddingTop: HEADER_HEIGHT, // Clear the absolutely-positioned app bar
    paddingBottom: 80, // Space for bottom tab bar
  },
  skeletonList: {
    paddingTop: 12,
  },
});

