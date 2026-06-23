import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
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
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface HashtagPost {
  id: string;
  author: PostAuthor;
  content: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
}

interface HashtagFeedResponse {
  posts: HashtagPost[];
  nextCursor: string | null;
  totalCount?: number;
}

interface HashtagMeta {
  tag: string;
  postCount: number;
  isFollowing: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 38 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[avatarStyles.image, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[avatarStyles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: { overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.primaryDark },
  fallback: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primaryDark,
  },
  initial: { color: Colors.white, fontWeight: '700', textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

interface PostCardProps {
  post: HashtagPost;
  onPress: (id: string) => void;
  onLike: (id: string) => void;
}

function PostCard({ post, onPress, onLike }: PostCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [cardStyles.container, pressed && cardStyles.pressed]}
      onPress={() => onPress(post.id)}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${post.author.username}`}
    >
      {/* Author row */}
      <View style={cardStyles.authorRow}>
        <Avatar uri={post.author.avatarUrl} username={post.author.username} size={38} />
        <View style={cardStyles.authorMeta}>
          <Text style={cardStyles.displayName} numberOfLines={1}>
            {post.author.displayName ?? post.author.username}
          </Text>
          <Text style={cardStyles.handle}>
            @{post.author.username} · {timeAgo(post.createdAt)}
          </Text>
        </View>
      </View>

      {/* Content */}
      <Text style={cardStyles.content} numberOfLines={5}>{post.content}</Text>

      {/* Action row */}
      <View style={cardStyles.actionRow}>
        {/* Like */}
        <Pressable
          style={({ pressed }) => [cardStyles.actionBtn, pressed && cardStyles.actionPressed]}
          onPress={(e) => { e.stopPropagation?.(); onLike(post.id); }}
          accessibilityRole="button"
          accessibilityLabel={post.isLiked ? 'Unlike' : 'Like'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[cardStyles.actionIcon, post.isLiked && cardStyles.likedIcon]}>
            {post.isLiked ? '♥' : '♡'}
          </Text>
          <Text style={[cardStyles.actionCount, post.isLiked && cardStyles.likedCount]}>
            {formatCount(post.likesCount)}
          </Text>
        </Pressable>

        {/* Comments */}
        <View style={cardStyles.actionBtn}>
          <Text style={cardStyles.actionIcon}>💬</Text>
          <Text style={cardStyles.actionCount}>{formatCount(post.commentsCount)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pressed: { opacity: 0.85 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  authorMeta: { flex: 1 },
  displayName: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  handle: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  content: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  actionPressed: { opacity: 0.6 },
  actionIcon: { fontSize: 15, color: Colors.textMuted },
  likedIcon: { color: Colors.like },
  actionCount: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  likedCount: { color: Colors.like },
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FeedSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={skelStyles.card}>
          <View style={skelStyles.authorRow}>
            <View style={skelStyles.avatar} />
            <View style={skelStyles.lines}>
              <View style={skelStyles.nameLine} />
              <View style={skelStyles.handleLine} />
            </View>
          </View>
          <View style={skelStyles.contentLine1} />
          <View style={skelStyles.contentLine2} />
        </View>
      ))}
    </>
  );
}

const skelStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated },
  lines: { gap: 6, flex: 1 },
  nameLine: { width: 110, height: 13, borderRadius: 6, backgroundColor: Colors.surfaceElevated },
  handleLine: { width: 80, height: 10, borderRadius: 5, backgroundColor: Colors.surfaceElevated },
  contentLine1: {
    width: '100%', height: 12, borderRadius: 6,
    backgroundColor: Colors.surfaceElevated, marginBottom: 7,
  },
  contentLine2: {
    width: '70%', height: 12, borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HashtagFeedScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();

  const [meta, setMeta] = useState<HashtagMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadingMoreRef = useRef(false);

  // ----- Fetch hashtag meta -----
  const fetchMeta = useCallback(async () => {
    if (!tag) return;
    setMetaLoading(true);
    try {
      const data = await apiClient<HashtagMeta>(
        `/v1/hashtags/${encodeURIComponent(tag)}`,
      );
      setMeta(data);
    } catch {
      // Non-fatal — show best effort
      setMeta({ tag: tag ?? '', postCount: 0, isFollowing: false });
    } finally {
      setMetaLoading(false);
    }
  }, [tag]);

  // ----- Fetch feed -----
  const fetchFeed = useCallback(async (cursor?: string | null) => {
    if (!tag) return;
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;

    if (!cursor) setFeedLoading(true);
    setFeedError(null);

    try {
      const params = new URLSearchParams({ hashtag: tag, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const data = await apiClient<HashtagFeedResponse>(
        `/v1/posts?${params.toString()}`,
      );
      const incoming = data.posts ?? [];
      if (cursor) {
        setPosts((prev) => [...prev, ...incoming]);
      } else {
        setPosts(incoming);
        // Sync total count to meta if provided
        if (data.totalCount !== undefined && meta) {
          setMeta((m) => m ? { ...m, postCount: data.totalCount! } : m);
        }
      }
      setNextCursor(data.nextCursor ?? null);
    } catch (err: unknown) {
      setFeedError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setFeedLoading(false);
      loadingMoreRef.current = false;
    }
  }, [tag, meta]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPosts([]);
    setNextCursor(null);
    await fetchMeta();
    await fetchFeed();
    setRefreshing(false);
  }, [fetchMeta, fetchFeed]);

  // ----- Infinite scroll -----
  const handleEndReached = useCallback(() => {
    if (nextCursor && !loadingMoreRef.current) {
      fetchFeed(nextCursor);
    }
  }, [nextCursor, fetchFeed]);

  // ----- Follow/unfollow hashtag -----
  const handleFollowToggle = useCallback(async () => {
    if (!tag || !meta) return;
    const wasFollowing = meta.isFollowing;
    setMeta((m) => m ? { ...m, isFollowing: !wasFollowing } : m);
    try {
      await apiClient(
        `/v1/hashtags/${encodeURIComponent(tag)}/follow`,
        { method: wasFollowing ? 'DELETE' : 'POST' },
      );
    } catch {
      setMeta((m) => m ? { ...m, isFollowing: wasFollowing } : m);
    }
  }, [tag, meta]);

  // ----- Optimistic like toggle -----
  const handleLikeToggle = useCallback(async (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    if (!target) return;

    const wasLiked = target.isLiked;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return { ...p, isLiked: !wasLiked, likesCount: p.likesCount + (wasLiked ? -1 : 1) };
      }),
    );

    try {
      await apiClient(
        `/v1/posts/${encodeURIComponent(postId)}/like`,
        { method: wasLiked ? 'DELETE' : 'POST' },
      );
    } catch {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return { ...p, isLiked: wasLiked, likesCount: p.likesCount + (wasLiked ? 1 : -1) };
        }),
      );
    }
  }, [posts]);

  // ----- Navigate to post -----
  const handlePostPress = useCallback((id: string) => {
    router.push(`/post/${encodeURIComponent(id)}` as never);
  }, [router]);

  // ----- Render item -----
  const renderItem = useCallback(
    ({ item }: { item: HashtagPost }) => (
      <PostCard post={item} onPress={handlePostPress} onLike={handleLikeToggle} />
    ),
    [handlePostPress, handleLikeToggle],
  );

  const keyExtractor = useCallback((item: HashtagPost) => item.id, []);

  const isFollowing = meta?.isFollowing ?? false;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.navTitle} numberOfLines={1}>
            #{tag}
          </Text>
          {!metaLoading && meta ? (
            <Text style={styles.postCount}>
              {formatCount(meta.postCount)} posts
            </Text>
          ) : null}
        </View>

        {/* Follow toggle */}
        <TouchableOpacity
          onPress={handleFollowToggle}
          style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? 'Unfollow hashtag' : 'Follow hashtag'}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feed */}
      {feedLoading && posts.length === 0 ? (
        <FeedSkeleton />
      ) : feedError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{feedError}</Text>
          <Pressable onPress={() => fetchFeed()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<HashtagPost>
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>#</Text>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySubtitle}>
                Be the first to post with #{tag}
              </Text>
            </View>
          }
          ListFooterComponent={
            !feedLoading && nextCursor ? (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={styles.footerLoader}
              />
            ) : null
          }
          contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  // Nav bar
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: Colors.primaryLight,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  navTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  postCount: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  followBtnActive: {
    backgroundColor: Colors.primary,
  },
  followBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  followBtnTextActive: {
    color: Colors.white,
  },

  // States
  errorBox: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  footerLoader: { paddingVertical: 16 },

  emptyContainer: { flexGrow: 1 },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    color: Colors.primaryLight,
    fontWeight: '900',
    marginBottom: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
