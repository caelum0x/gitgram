import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colours — mirrors profile.tsx palette
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
  error: '#F87171',
  white: '#FFFFFF',
} as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 2;
const GRID_GAP = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS + 1)) / GRID_COLUMNS;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

async function authedFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CollectionOwner {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  owner: CollectionOwner;
  createdAt: string;
}

interface CollectionPost {
  id: string;
  content: string;
  thumbnailUrl?: string | null;
  mediaUrls?: string[];
  likesCount: number;
  createdAt: string;
}

interface CollectionPostsResponse {
  posts: CollectionPost[];
  nextCursor?: string | null;
}

// ---------------------------------------------------------------------------
// Owner avatar
// ---------------------------------------------------------------------------
interface OwnerAvatarProps {
  uri?: string | null;
  username: string;
}

function OwnerAvatar({ uri, username }: OwnerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();
  const SIZE = 28;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[ownerAvatarStyles.image, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[ownerAvatarStyles.placeholder, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}>
      <Text style={ownerAvatarStyles.initial}>{initial}</Text>
    </View>
  );
}

const ownerAvatarStyles = StyleSheet.create({
  image: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  placeholder: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Post thumbnail grid cell
// ---------------------------------------------------------------------------
interface PostThumbProps {
  post: CollectionPost;
  onPress: (id: string) => void;
}

function PostThumb({ post, onPress }: PostThumbProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUri = post.thumbnailUrl ?? post.mediaUrls?.[0] ?? null;
  const hasImage = imageUri && !imgFailed;

  return (
    <Pressable
      onPress={() => onPress(post.id)}
      style={({ pressed }) => [
        thumbStyles.cell,
        { width: THUMB_SIZE, height: THUMB_SIZE },
        pressed && thumbStyles.pressed,
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: imageUri! }}
          style={thumbStyles.image}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={thumbStyles.textFallback}>
          <Text style={thumbStyles.fallbackText} numberOfLines={4}>
            {post.content}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const thumbStyles = StyleSheet.create({
  cell: {
    backgroundColor: Colors.surfaceElevated,
    margin: GRID_GAP / 2,
    overflow: 'hidden',
    borderRadius: 4,
  },
  pressed: { opacity: 0.75 },
  image: { flex: 1, width: '100%', height: '100%' },
  textFallback: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  fallbackText: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
});

// ---------------------------------------------------------------------------
// Collection detail screen
// ---------------------------------------------------------------------------

// Route params — compatible with both expo-router useLocalSearchParams and
// react-navigation useRoute. Cast at call-site as needed.
interface RouteParams {
  id: string;
}

export default function CollectionDetailScreen() {
  // expo-router: use useLocalSearchParams(); react-navigation: useRoute<...>().params
  // We accept the param via a prop-style pattern for maximum compatibility.
  // In an expo-router project, replace the next two lines with:
  //   import { useLocalSearchParams } from 'expo-router';
  //   const { id } = useLocalSearchParams<RouteParams>();
  const [collectionId] = useState<string>(() => {
    // Attempt to read from expo-router search params if available at runtime.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useLocalSearchParams } = require('expo-router') as {
        useLocalSearchParams: <T extends Record<string, string>>() => T;
      };
      return useLocalSearchParams<RouteParams>().id ?? '';
    } catch {
      return '';
    }
  });

  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const [posts, setPosts] = useState<CollectionPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  // ----- Load collection header -----
  const loadCollection = useCallback(async () => {
    if (!collectionId) return;
    setCollectionLoading(true);
    setCollectionError(null);
    try {
      const data = await authedFetch<CollectionDetail>(`/v1/collections/${collectionId}`);
      setCollection(data);
    } catch (err: unknown) {
      setCollectionError(err instanceof Error ? err.message : 'Failed to load collection');
    } finally {
      setCollectionLoading(false);
    }
  }, [collectionId]);

  // ----- Load posts (paginated) -----
  const loadPosts = useCallback(async (cursor?: string | null) => {
    if (!collectionId) return;
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const data = await authedFetch<CollectionPostsResponse>(
        `/v1/collections/${collectionId}/posts?${params.toString()}`,
      );
      const incoming = data.posts ?? [];
      setPosts((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setPostsNextCursor(data.nextCursor ?? null);
      setPostsHasMore(!!data.nextCursor);
    } catch {
      setPostsHasMore(false);
    } finally {
      setPostsLoading(false);
      loadingMoreRef.current = false;
    }
  }, [collectionId]);

  useEffect(() => {
    loadCollection();
    loadPosts();
  }, [loadCollection, loadPosts]);

  // ----- Pull-to-refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPosts([]);
    setPostsNextCursor(null);
    setPostsHasMore(true);
    await Promise.all([loadCollection(), loadPosts()]);
    setRefreshing(false);
  }, [loadCollection, loadPosts]);

  // ----- Infinite scroll -----
  const handleEndReached = useCallback(() => {
    if (postsHasMore && postsNextCursor && !loadingMoreRef.current) {
      loadPosts(postsNextCursor);
    }
  }, [postsHasMore, postsNextCursor, loadPosts]);

  // ----- Navigation -----
  const handleBack = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { router } = require('expo-router') as { router: { back: () => void } };
      router.back();
    } catch {
      // fallback — no-op if router unavailable
    }
  }, []);

  const handlePostPress = useCallback((_id: string) => {
    // Wire to router.push(`/post/${id}`)
  }, []);

  // ----- Render helpers -----
  const keyExtractor = useCallback((item: CollectionPost) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: CollectionPost }) => (
      <PostThumb post={item} onPress={handlePostPress} />
    ),
    [handlePostPress],
  );

  const renderHeader = useCallback(() => {
    if (collectionLoading) {
      return (
        <View style={styles.headerSkeleton}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonMeta} />
        </View>
      );
    }

    if (collectionError) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{collectionError}</Text>
          <Pressable onPress={loadCollection} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!collection) return null;

    return (
      <View style={styles.collectionHeader}>
        {/* Collection name + privacy badge */}
        <View style={styles.titleRow}>
          <Text style={styles.collectionName} numberOfLines={2}>
            {collection.name}
          </Text>
          <View
            style={[
              styles.privacyBadge,
              collection.isPublic ? styles.publicBadge : styles.privateBadge,
            ]}
          >
            <Text style={styles.privacyText}>
              {collection.isPublic ? 'Public' : 'Private'}
            </Text>
          </View>
        </View>

        {/* Description */}
        {collection.description ? (
          <Text style={styles.description}>{collection.description}</Text>
        ) : null}

        {/* Item count */}
        <Text style={styles.itemCount}>
          {formatCount(collection.itemCount)} {collection.itemCount === 1 ? 'item' : 'items'}
        </Text>

        {/* Owner */}
        <View style={styles.ownerRow}>
          <OwnerAvatar uri={collection.owner.avatarUrl} username={collection.owner.username} />
          <Text style={styles.ownerUsername}>@{collection.owner.username}</Text>
        </View>

        <View style={styles.divider} />
      </View>
    );
  }, [collection, collectionLoading, collectionError, loadCollection]);

  const renderEmpty = useCallback(() => {
    if (postsLoading && posts.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{'[col]'}</Text>
        <Text style={styles.emptyPrimary}>This collection is empty</Text>
        <Text style={styles.emptySecondary}>Add posts to see them here</Text>
      </View>
    );
  }, [postsLoading, posts.length]);

  const renderFooter = useCallback(() =>
    postsLoading && posts.length > 0 ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    ) : null,
  [postsLoading, posts.length]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top bar with back button */}
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'<'}</Text>
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {collection?.name ?? 'Collection'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Top navigation bar
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  topBarTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  backIcon: {
    color: Colors.primaryLight,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  pressed: { opacity: 0.65 },

  // Collection header section
  collectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  collectionName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  privacyBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  publicBadge: { backgroundColor: Colors.primaryDark },
  privateBadge: { backgroundColor: Colors.surfaceElevated },
  privacyText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  itemCount: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  ownerUsername: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: -16,
    marginBottom: 4,
  },

  // Grid
  listContent: {
    paddingBottom: 40,
    backgroundColor: Colors.background,
  },
  row: {
    justifyContent: 'flex-start',
    paddingHorizontal: GRID_GAP / 2,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    color: Colors.textMuted,
    fontSize: 36,
    marginBottom: 14,
  },
  emptyPrimary: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySecondary: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Loading / error states
  headerSkeleton: {
    padding: 20,
    gap: 12,
  },
  skeletonTitle: {
    width: '70%',
    height: 22,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
  skeletonMeta: {
    width: '40%',
    height: 14,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
