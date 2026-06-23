import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewToken,
} from 'react-native';
import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const Colors = {
  background: '#0F0F1A',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  like: '#EF4444',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.55)',
  badgeBg: 'rgba(0,0,0,0.6)',
} as const;

/** Background tint per language for the reel card. */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#1E1B4B',
  JavaScript: '#1A1A00',
  Python: '#0F1F0F',
  Rust: '#1A0F0A',
  Go: '#001A1A',
  Java: '#1A1000',
  'C++': '#0D0D1A',
  'C#': '#0D1A0D',
  Ruby: '#1A0505',
  Swift: '#1A100A',
  Kotlin: '#100A1A',
  PHP: '#0A001A',
  Shell: '#001A0A',
  Dart: '#001017',
  default: '#0F0F1A',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReelAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Reel {
  id: string;
  title: string;
  description: string;
  codeSnippet: string | null;
  language: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked: boolean;
  author: ReelAuthor;
  createdAt: string;
}

interface ReelsResponse {
  reels: Reel[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchReelsPage(cursor?: string | null): Promise<ReelsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient<ReelsResponse>(`/v1/reels${query}`);
}

async function likeReel(id: string): Promise<{ liked: boolean; likesCount: number }> {
  return apiClient<{ liked: boolean; likesCount: number }>(
    `/v1/reels/${encodeURIComponent(id)}/like`,
    { method: 'POST' },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function languageBgColor(lang: string): string {
  return LANGUAGE_COLORS[lang] ?? LANGUAGE_COLORS.default;
}

// ---------------------------------------------------------------------------
// HeartBurst — double-tap like animation overlay
// ---------------------------------------------------------------------------

interface HeartBurstProps {
  visible: boolean;
}

function HeartBurst({ visible }: HeartBurstProps) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    scale.setValue(0);
    opacity.setValue(1);

    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.4,
        useNativeDriver: true,
        friction: 4,
        tension: 120,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        heartStyles.container,
        { opacity, transform: [{ scale }] },
      ]}
      pointerEvents="none"
    >
      <Text style={heartStyles.heart}>{'❤️'}</Text>
    </Animated.View>
  );
}

const heartStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heart: {
    fontSize: 96,
  },
});

// ---------------------------------------------------------------------------
// ReelCard — single full-screen reel
// ---------------------------------------------------------------------------

interface ReelCardProps {
  reel: Reel;
  isActive: boolean;
  onLikeCommit: (reelId: string, liked: boolean, likesCount: number) => void;
}

function ReelCard({ reel, isActive, onLikeCommit }: ReelCardProps) {
  const [liked, setLiked] = useState(reel.isLiked);
  const [likeCount, setLikeCount] = useState(reel.likesCount);
  const [paused, setPaused] = useState(false);
  const [heartVisible, setHeartVisible] = useState(false);

  const lastTapRef = useRef<number>(0);
  const likeInFlightRef = useRef(false);

  // Sync parent changes (e.g. after optimistic rollback)
  useEffect(() => {
    setLiked(reel.isLiked);
    setLikeCount(reel.likesCount);
  }, [reel.isLiked, reel.likesCount]);

  // Reset paused state when reel leaves view
  useEffect(() => {
    if (!isActive) setPaused(false);
  }, [isActive]);

  const handleSingleTap = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  const triggerLike = useCallback(async () => {
    if (likeInFlightRef.current) return;
    likeInFlightRef.current = true;

    const prevLiked = liked;
    const prevCount = likeCount;

    // Only fire heart if not already liked
    if (!prevLiked) {
      setHeartVisible(true);
      setTimeout(() => setHeartVisible(false), 900);
    }

    setLiked(true);
    setLikeCount((c) => (prevLiked ? c : c + 1));

    try {
      const result = await likeReel(reel.id);
      setLiked(result.liked);
      setLikeCount(result.likesCount);
      onLikeCommit(reel.id, result.liked, result.likesCount);
    } catch {
      // Rollback
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      likeInFlightRef.current = false;
    }
  }, [liked, likeCount, reel.id, onLikeCommit]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300) {
      // Double tap — trigger like
      triggerLike();
    } else {
      // Schedule single tap (cancelled if second tap arrives)
      const id = setTimeout(handleSingleTap, 320);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [handleSingleTap, triggerLike]);

  const handleLikeButton = useCallback(() => {
    triggerLike();
  }, [triggerLike]);

  const bgColor = languageBgColor(reel.language);
  const displayText = reel.codeSnippet ?? reel.description;

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={[cardStyles.container, { backgroundColor: bgColor }]}>
        {/* Language badge — top left */}
        <View style={cardStyles.langBadge}>
          <Text style={cardStyles.langBadgeText}>{reel.language}</Text>
        </View>

        {/* Pause indicator */}
        {paused && isActive ? (
          <View style={cardStyles.pauseOverlay} pointerEvents="none">
            <Text style={cardStyles.pauseIcon}>{'⏸'}</Text>
          </View>
        ) : null}

        {/* Heart burst on double tap */}
        <HeartBurst visible={heartVisible} />

        {/* Code / description content */}
        <View style={cardStyles.contentArea}>
          {reel.title ? (
            <Text style={cardStyles.reelTitle} numberOfLines={2}>
              {reel.title}
            </Text>
          ) : null}
          <View style={cardStyles.codeBlock}>
            <Text style={cardStyles.codeText} numberOfLines={18}>
              {displayText}
            </Text>
          </View>
        </View>

        {/* Dark gradient overlay at bottom */}
        <View style={cardStyles.bottomOverlay} pointerEvents="none" />

        {/* Author info — bottom left */}
        <View style={cardStyles.authorRow}>
          <View style={cardStyles.avatarCircle}>
            <Text style={cardStyles.avatarInitial}>
              {(reel.author.displayName ?? reel.author.username).slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={cardStyles.authorText}>
            {reel.author.displayName ? (
              <Text style={cardStyles.authorName} numberOfLines={1}>
                {reel.author.displayName}
              </Text>
            ) : null}
            <Text style={cardStyles.authorUsername} numberOfLines={1}>
              {'@'}{reel.author.username}
            </Text>
            {reel.description && reel.codeSnippet ? (
              <Text style={cardStyles.authorDesc} numberOfLines={2}>
                {reel.description}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right sidebar: Like / Comment / Share */}
        <View style={cardStyles.sidebar}>
          {/* Like */}
          <TouchableOpacity
            style={cardStyles.sidebarButton}
            onPress={handleLikeButton}
            activeOpacity={0.75}
          >
            <Text style={[cardStyles.sidebarIcon, liked && cardStyles.sidebarIconLiked]}>
              {'❤️'}
            </Text>
            <Text style={[cardStyles.sidebarCount, liked && cardStyles.sidebarCountLiked]}>
              {formatCount(likeCount)}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity style={cardStyles.sidebarButton} activeOpacity={0.75}>
            <Text style={cardStyles.sidebarIcon}>{'💬'}</Text>
            <Text style={cardStyles.sidebarCount}>
              {formatCount(reel.commentsCount)}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={cardStyles.sidebarButton} activeOpacity={0.75}>
            <Text style={cardStyles.sidebarIcon}>{'📤'}</Text>
            <Text style={cardStyles.sidebarCount}>
              {formatCount(reel.sharesCount)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  langBadge: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    backgroundColor: Colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  langBadgeText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pauseIcon: {
    fontSize: 64,
    opacity: 0.85,
  },
  contentArea: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 80,
    bottom: 160,
    justifyContent: 'flex-start',
  },
  reelTitle: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  codeText: {
    color: '#A5F3FC',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 19,
    letterSpacing: 0.2,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
    backgroundColor: Colors.overlay,
  },
  authorRow: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 84,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    zIndex: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    flexShrink: 0,
  },
  avatarInitial: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  authorText: {
    flex: 1,
  },
  authorName: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  authorUsername: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  authorDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sidebar: {
    position: 'absolute',
    right: 12,
    bottom: 90,
    zIndex: 10,
    alignItems: 'center',
    gap: 20,
  },
  sidebarButton: {
    alignItems: 'center',
    gap: 4,
  },
  sidebarIcon: {
    fontSize: 30,
  },
  sidebarIconLiked: {
    // The ❤️ emoji is already red; this is a hook for tinting if a custom icon is used
  },
  sidebarCount: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sidebarCountLiked: {
    color: Colors.like,
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyReels() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{'🎬'}</Text>
      <Text style={emptyStyles.heading}>No reels yet</Text>
      <Text style={emptyStyles.body}>
        Short code demos will appear here. Be the first to post one!
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 20,
  },
  heading: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
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
// LoadingReel — shown while initial fetch is in progress
// ---------------------------------------------------------------------------

function LoadingReel() {
  return (
    <View style={loadingStyles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={loadingStyles.label}>Loading reels…</Text>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    gap: 16,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
});

// ---------------------------------------------------------------------------
// ErrorReel
// ---------------------------------------------------------------------------

interface ErrorReelProps {
  message: string;
  onRetry: () => void;
}

function ErrorReel({ message, onRetry }: ErrorReelProps) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.icon}>{'⚠️'}</Text>
      <Text style={errorStyles.message}>{message}</Text>
      <TouchableOpacity style={errorStyles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
        <Text style={errorStyles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: {
    fontSize: 56,
  },
  message: {
    color: '#F87171',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});

// ---------------------------------------------------------------------------
// ReelsScreen — main export
// ---------------------------------------------------------------------------

export default function ReelsScreen() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const nextCursorRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);
  const flatListRef = useRef<FlatList<Reel>>(null);

  // ----- Initial load -----
  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchReelsPage(null);
      setReels(data.reels);
      nextCursorRef.current = data.nextCursor;
      setHasMore(!!data.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reels');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ----- Load more (infinite scroll — triggered when reaching last reel) -----
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMoreRef.current || !nextCursorRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const data = await fetchReelsPage(nextCursorRef.current);
      setReels((prev) => [...prev, ...data.reels]);
      nextCursorRef.current = data.nextCursor;
      setHasMore(!!data.nextCursor);
    } catch {
      // Silently fail — user reaching end triggers retry on next scroll
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore]);

  // ----- ViewabilityConfig: 50% threshold -----
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const idx = viewableItems[0].index ?? 0;
        setActiveIndex(idx);
      }
    },
  ).current;

  // ----- Like commit callback (syncs reel in list after server response) -----
  const handleLikeCommit = useCallback(
    (reelId: string, liked: boolean, likesCount: number) => {
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId ? { ...r, isLiked: liked, likesCount } : r,
        ),
      );
    },
    [],
  );

  // ----- Render item -----
  const renderItem = useCallback(
    ({ item, index }: { item: Reel; index: number }) => (
      <ReelCard
        reel={item}
        isActive={index === activeIndex}
        onLikeCommit={handleLikeCommit}
      />
    ),
    [activeIndex, handleLikeCommit],
  );

  const keyExtractor = useCallback((item: Reel) => item.id, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<Reel> | null | undefined, index: number) => ({
      length: SCREEN_HEIGHT,
      offset: SCREEN_HEIGHT * index,
      index,
    }),
    [],
  );

  // ----- Footer spinner while loading next page -----
  const listFooter = isLoadingMore ? (
    <View style={screenStyles.footerLoader}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  ) : null;

  // ----- Guards -----
  if (isLoading) {
    return (
      <View style={screenStyles.root}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <LoadingReel />
      </View>
    );
  }

  if (error && reels.length === 0) {
    return (
      <View style={screenStyles.root}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <ErrorReel message={error} onRetry={loadInitial} />
      </View>
    );
  }

  return (
    <View style={screenStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList<Reel>
        ref={flatListRef}
        data={reels}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        // Vertical snap — one full-screen reel at a time
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        // Viewability
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        // Infinite scroll
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<EmptyReels />}
        ListFooterComponent={listFooter}
        // Performance
        removeClippedSubviews
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
      />
    </View>
  );
}

const screenStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  footerLoader: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
