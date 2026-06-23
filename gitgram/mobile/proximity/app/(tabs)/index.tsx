import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  accent: '#4F46E5',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  like: '#EF4444',
  error: '#F87171',
  white: '#FFFFFF',
  storyRing1: '#7C3AED',
  storyRing2: '#4F46E5',
  storyRingSeen: '#2D2D50',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StoryUser {
  id: string;
  username: string;
  avatar?: string;
  displayName?: string;
  hasSeen?: boolean;
}

interface FeedPost {
  id: string;
  content: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: string;
  isLiked?: boolean;
  user: {
    id: string;
    username: string;
    avatar?: string;
    displayName?: string;
  };
}

interface FeedResponse {
  posts: FeedPost[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('accessToken');
  } catch {
    return null;
  }
}

async function fetchFeedPage(cursor?: string | null): Promise<FeedResponse> {
  const token = await getToken();
  const params = new URLSearchParams({ limit: '20' });
  if (cursor) params.set('cursor', cursor);

  const response = await fetch(
    `${API_BASE_URL}/v1/posts/feed?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Feed request failed: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;
  return {
    posts: data.posts ?? data ?? [],
    nextCursor: data.nextCursor ?? data.pagination?.nextCursor ?? null,
    hasMore: data.hasMore ?? !!data.nextCursor,
  };
}

async function fetchStories(): Promise<StoryUser[]> {
  const token = await getToken();
  try {
    const response = await fetch(`${API_BASE_URL}/v1/stories/feed`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) return [];
    const json = await response.json();
    const data = json.data ?? json;
    return data.users ?? data ?? [];
  } catch {
    return [];
  }
}

async function toggleLike(postId: string): Promise<{ liked: boolean; likesCount: number }> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}/v1/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`Like request failed: ${response.status}`);
  const json = await response.json();
  return json.data ?? json;
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string;
  username: string;
  size?: number;
}

function Avatar({ username, size = 40 }: AvatarProps) {
  const initials = username.slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        avatarStyles.wrapper,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// StoriesRow — horizontal scroll of story avatars with gradient-style rings
// ---------------------------------------------------------------------------
interface StoriesRowProps {
  users: StoryUser[];
  onPressStory: (user: StoryUser) => void;
}

function StoryAvatar({ user, onPress }: { user: StoryUser; onPress: () => void }) {
  const ringColor = user.hasSeen ? Colors.storyRingSeen : Colors.storyRing1;
  return (
    <TouchableOpacity
      style={storyStyles.item}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Outer gradient ring simulation: two concentric borders */}
      <View style={[storyStyles.ringOuter, { borderColor: ringColor }]}>
        <View style={storyStyles.ringInner}>
          <Avatar
            uri={user.avatar}
            username={user.username}
            size={56}
          />
        </View>
      </View>
      <Text style={storyStyles.username} numberOfLines={1}>
        {user.displayName ?? user.username}
      </Text>
    </TouchableOpacity>
  );
}

function StoriesRow({ users, onPressStory }: StoriesRowProps) {
  if (users.length === 0) return null;

  return (
    <View style={storyStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={storyStyles.scrollContent}
      >
        {users.map((user) => (
          <StoryAvatar
            key={user.id}
            user={user}
            onPress={() => onPressStory(user)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const storyStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 72,
  },
  ringOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Colors.background,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
    width: 68,
  },
});

// ---------------------------------------------------------------------------
// PostCard component
// ---------------------------------------------------------------------------
interface PostCardProps {
  post: FeedPost;
  onLike: (postId: string) => void;
}

function PostCard({ post, onLike }: PostCardProps) {
  const [liked, setLiked] = useState(!!post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    setLiked(!!post.isLiked);
    setLikeCount(post.likesCount);
  }, [post.isLiked, post.likesCount]);

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    setLikeLoading(true);
    try {
      const result = await toggleLike(post.id);
      setLiked(result.liked);
      setLikeCount(result.likesCount);
      onLike(post.id);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }, [liked, likeCount, likeLoading, post.id, onLike]);

  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <Avatar uri={post.user.avatar} username={post.user.username} size={40} />
          <View style={cardStyles.userInfo}>
            {post.user.displayName ? (
              <Text style={cardStyles.displayName} numberOfLines={1}>
                {post.user.displayName}
              </Text>
            ) : null}
            <Text style={cardStyles.username} numberOfLines={1}>
              @{post.user.username}
            </Text>
          </View>
        </View>
        <Text style={cardStyles.timestamp}>{timeAgo(post.createdAt)}</Text>
      </View>

      {post.content ? (
        <Text style={cardStyles.content}>{post.content}</Text>
      ) : null}

      <View style={cardStyles.actionBar}>
        <TouchableOpacity
          style={cardStyles.actionButton}
          onPress={handleLike}
          disabled={likeLoading}
          activeOpacity={0.7}
        >
          <Text style={[cardStyles.actionIcon, liked && cardStyles.likedIcon]}>
            {liked ? '❤️' : '♡'}
          </Text>
          <Text style={[cardStyles.actionCount, liked && cardStyles.likedCount]}>
            {formatCount(likeCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionButton} activeOpacity={0.7}>
          <Text style={cardStyles.actionIcon}>{'💬'}</Text>
          <Text style={cardStyles.actionCount}>{formatCount(post.commentsCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionButton} activeOpacity={0.7}>
          <Text style={cardStyles.actionIcon}>{'🔁'}</Text>
          <Text style={cardStyles.actionCount}>{formatCount(post.sharesCount ?? 0)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  content: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  likedIcon: {
    color: Colors.like,
  },
  actionCount: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  likedCount: {
    color: Colors.like,
  },
});

// ---------------------------------------------------------------------------
// Skeleton placeholder for loading state
// ---------------------------------------------------------------------------
function PostSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.header}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.meta}>
          <View style={skeletonStyles.nameLine} />
          <View style={skeletonStyles.usernameLine} />
        </View>
      </View>
      <View style={skeletonStyles.line1} />
      <View style={skeletonStyles.line2} />
      <View style={skeletonStyles.line3} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
  },
  meta: {
    gap: 6,
  },
  nameLine: {
    width: 120,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  usernameLine: {
    width: 80,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  line1: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
    width: '100%',
  },
  line2: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
    width: '85%',
  },
  line3: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    width: '60%',
  },
});

// ---------------------------------------------------------------------------
// Stories skeleton
// ---------------------------------------------------------------------------
function StoriesSkeleton() {
  const items = [1, 2, 3, 4, 5];
  return (
    <View style={storySkeletonStyles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storySkeletonStyles.row}>
        {items.map((n) => (
          <View key={n} style={storySkeletonStyles.item}>
            <View style={storySkeletonStyles.circle} />
            <View style={storySkeletonStyles.label} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const storySkeletonStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 12,
  },
  row: {
    paddingHorizontal: 16,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  circle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.surfaceElevated,
  },
  label: {
    marginTop: 6,
    width: 48,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyFeed() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{'📭'}</Text>
      <Text style={emptyStyles.heading}>No posts yet</Text>
      <Text style={emptyStyles.body}>
        Follow developers to see their updates here.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  icon: {
    fontSize: 56,
    marginBottom: 16,
  },
  heading: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Main feed screen
// ---------------------------------------------------------------------------
export default function GitgramFeedScreen() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nextCursorRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [feedData, stories] = await Promise.all([
        fetchFeedPage(null),
        fetchStories(),
      ]);
      setPosts(feedData.posts);
      setStoryUsers(stories);
      nextCursorRef.current = feedData.nextCursor ?? null;
      setHasMore(feedData.hasMore ?? !!feedData.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const [feedData, stories] = await Promise.all([
        fetchFeedPage(null),
        fetchStories(),
      ]);
      setPosts(feedData.posts);
      setStoryUsers(stories);
      nextCursorRef.current = feedData.nextCursor ?? null;
      setHasMore(feedData.hasMore ?? !!feedData.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh feed');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMoreRef.current || isLoading || isRefreshing) return;
    if (!nextCursorRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const data = await fetchFeedPage(nextCursorRef.current);
      setPosts((prev) => [...prev, ...data.posts]);
      nextCursorRef.current = data.nextCursor ?? null;
      setHasMore(data.hasMore ?? !!data.nextCursor);
    } catch {
      // Silently fail — user can scroll back to trigger again
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoading, isRefreshing]);

  const handleLike = useCallback((_postId: string) => {
    // PostCard manages its own optimistic state.
    // This is a hook point for future global sync (e.g. notification badges).
  }, []);

  const handlePressStory = useCallback((_user: StoryUser) => {
    // Navigation to story viewer will be wired here once story screen exists
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => <PostCard post={item} onLike={handleLike} />,
    [handleLike]
  );

  const keyExtractor = useCallback((item: FeedPost) => item.id, []);

  const listHeader = (
    <>
      <View style={screenStyles.header}>
        <View style={screenStyles.headerLeft}>
          <View style={screenStyles.logoMark}>
            <Text style={screenStyles.logoText}>G</Text>
          </View>
          <Text style={screenStyles.headerTitle}>gitgram</Text>
        </View>
      </View>
      {isLoading ? (
        <StoriesSkeleton />
      ) : (
        <StoriesRow users={storyUsers} onPressStory={handlePressStory} />
      )}
    </>
  );

  const listFooter = isLoadingMore ? (
    <View style={screenStyles.footerLoader}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  ) : null;

  if (isLoading) {
    return (
      <SafeAreaView style={screenStyles.safeArea}>
        {listHeader}
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </SafeAreaView>
    );
  }

  if (error && posts.length === 0) {
    return (
      <SafeAreaView style={screenStyles.safeArea}>
        {listHeader}
        <View style={screenStyles.errorContainer}>
          <Text style={screenStyles.errorIcon}>{'⚠️'}</Text>
          <Text style={screenStyles.errorText}>{error}</Text>
          <TouchableOpacity style={screenStyles.retryButton} onPress={loadInitial}>
            <Text style={screenStyles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.safeArea}>
      <FlatList<FeedPost>
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyFeed />}
        ListFooterComponent={listFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        contentContainerStyle={posts.length === 0 ? screenStyles.emptyContent : undefined}
      />
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: {
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
    gap: 10,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  emptyContent: {
    flex: 1,
  },
});
