import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION_MS = 5000;
const SWIPE_DOWN_THRESHOLD = 80;

const Colors = {
  background: '#000000',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.45)',
  progressTrack: 'rgba(255,255,255,0.35)',
  progressFill: '#FFFFFF',
  avatarBg: '#5B21B6',
  error: '#EF4444',
  closeBtn: 'rgba(0,0,0,0.5)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoryAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Story {
  id: string;
  author: StoryAuthor;
  content: string | null;
  imageUrl: string | null;
  backgroundColor: string;
  privacy: 'public' | 'followers';
  expiresAt: string;
  createdAt: string;
}

interface StoryGroup {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  stories: Story[];
}

interface FeedResponse {
  users: StoryGroup[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function avatarInitials(author: StoryAuthor): string {
  const name = author.displayName ?? author.username;
  return name.slice(0, 2).toUpperCase();
}

async function fetchStoryFeed(): Promise<StoryGroup[]> {
  const response = await apiClient<FeedResponse | StoryGroup[]>(
    '/api/v1/stories/feed?limit=20',
  );
  if (Array.isArray(response)) return response;
  const typed = response as FeedResponse;
  return typed.users ?? [];
}

async function markStoryViewed(storyId: string): Promise<void> {
  try {
    await apiClient(`/api/v1/stories/${encodeURIComponent(storyId)}/view`, {
      method: 'POST',
    });
  } catch {
    // View tracking is non-critical — swallow silently
  }
}

// ---------------------------------------------------------------------------
// Progress bar segment
// ---------------------------------------------------------------------------

interface ProgressSegmentProps {
  /** 0 = empty, 1 = full, -1 = animating */
  state: 'empty' | 'filled' | 'animating';
  animValue: Animated.Value;
  count: number;
}

function ProgressSegment({ state, animValue, count }: ProgressSegmentProps): React.JSX.Element {
  const segmentWidth = (SCREEN_WIDTH - 16 - (count - 1) * 4) / count;

  const fillWidth =
    state === 'filled'
      ? segmentWidth
      : state === 'empty'
      ? 0
      : animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, segmentWidth],
        });

  return (
    <View style={[progressStyles.track, { width: segmentWidth }]}>
      <Animated.View style={[progressStyles.fill, { width: fillWidth }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: Colors.progressTrack,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    backgroundColor: Colors.progressFill,
    borderRadius: 2,
  },
});

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function StoryAvatar({
  author,
  size,
}: {
  author: StoryAuthor;
  size: number;
}): React.JSX.Element {
  return author.avatarUrl ? (
    <Image
      source={{ uri: author.avatarUrl }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: Colors.white,
      }}
    />
  ) : (
    <View
      style={[
        avatarStyles.initials,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initialsText, { fontSize: size * 0.36 }]}>
        {avatarInitials(author)}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  initials: {
    backgroundColor: Colors.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  initialsText: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Main story viewer
// ---------------------------------------------------------------------------

export default function StoriesViewerScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ userId?: string }>();
  const startUserId = params.userId;

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Current position: which user group and which story within that group
  const [groupIndex, setGroupIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);

  const isPaused = useRef(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const swipeTranslateY = useRef(new Animated.Value(0)).current;

  // -------------------------------------------------------------------------
  // Load feed
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const allGroups = await fetchStoryFeed();
        if (cancelled) return;

        if (allGroups.length === 0) {
          router.back();
          return;
        }

        setGroups(allGroups);

        // Jump to requested user if provided
        if (startUserId) {
          const idx = allGroups.findIndex((g) => g.userId === startUserId);
          if (idx >= 0) setGroupIndex(idx);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load stories.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startUserId]);

  // -------------------------------------------------------------------------
  // Derived current story
  // -------------------------------------------------------------------------

  const currentGroup = groups[groupIndex] ?? null;
  const currentStory = currentGroup?.stories[storyIndex] ?? null;

  // -------------------------------------------------------------------------
  // Advance to next story / user
  // -------------------------------------------------------------------------

  const goToNextStory = useCallback(() => {
    if (!currentGroup) return;

    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex((prev) => prev + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
    } else {
      router.back();
    }
  }, [currentGroup, storyIndex, groupIndex, groups.length]);

  const goToPrevStory = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(prevGroup ? prevGroup.stories.length - 1 : 0);
    }
    // No-op if already at very first story
  }, [storyIndex, groupIndex, groups]);

  // -------------------------------------------------------------------------
  // Progress animation — restarts on every story change
  // -------------------------------------------------------------------------

  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    isPaused.current = false;

    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });

    progressAnimRef.current.start(({ finished }) => {
      if (finished && !isPaused.current) {
        goToNextStory();
      }
    });
  }, [progressAnim, goToNextStory]);

  const stopProgress = useCallback(() => {
    progressAnimRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!loading && !loadError && currentStory) {
      startProgress();
      void markStoryViewed(currentStory.id);
    }
    return stopProgress;
  }, [loading, loadError, currentStory, startProgress, stopProgress]);

  // -------------------------------------------------------------------------
  // Pause / resume on long press
  // -------------------------------------------------------------------------

  const handleLongPress = useCallback(() => {
    isPaused.current = true;
    stopProgress();
  }, [stopProgress]);

  const handlePressOut = useCallback(() => {
    if (isPaused.current) {
      isPaused.current = false;
      startProgress();
    }
  }, [startProgress]);

  // -------------------------------------------------------------------------
  // Tap left / right to navigate
  // -------------------------------------------------------------------------

  const handleTap = useCallback(
    (evt: GestureResponderEvent) => {
      if (isPaused.current) return;
      const x = evt.nativeEvent.locationX;
      if (x < SCREEN_WIDTH * 0.35) {
        stopProgress();
        goToPrevStory();
      } else {
        stopProgress();
        goToNextStory();
      }
    },
    [goToPrevStory, goToNextStory, stopProgress],
  );

  // -------------------------------------------------------------------------
  // Swipe down to close
  // -------------------------------------------------------------------------

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dy > 0) {
          swipeTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dy > SWIPE_DOWN_THRESHOLD) {
          Animated.timing(swipeTranslateY, {
            toValue: SCREEN_HEIGHT,
            duration: 220,
            useNativeDriver: true,
          }).start(() => router.back());
        } else {
          Animated.spring(swipeTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const handleClose = useCallback(() => {
    stopProgress();
    router.back();
  }, [stopProgress]);

  // -------------------------------------------------------------------------
  // Render: loading / error
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
        <Text style={styles.loadingText}>Loading stories…</Text>
      </View>
    );
  }

  if (loadError || !currentGroup || !currentStory) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
        <Text style={styles.errorText}>
          {loadError ?? 'No stories available.'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isTextStory = !currentStory.imageUrl;
  const bgColor = isTextStory ? currentStory.backgroundColor : '#000000';
  const storyCount = currentGroup.stories.length;

  // -------------------------------------------------------------------------
  // Render: viewer
  // -------------------------------------------------------------------------

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: bgColor, transform: [{ translateY: swipeTranslateY }] }]}
      {...panResponder.panHandlers}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent />

      {/* ------------------------------------------------------------------ */}
      {/* Progress bars row                                                   */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.progressRow}>
        {currentGroup.stories.map((story, idx) => {
          const state =
            idx < storyIndex ? 'filled' : idx === storyIndex ? 'animating' : 'empty';
          return (
            <ProgressSegment
              key={story.id}
              state={state}
              animValue={progressAnim}
              count={storyCount}
            />
          );
        })}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Author header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.authorRow} pointerEvents="box-none">
        <StoryAvatar author={currentStory.author} size={36} />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName} numberOfLines={1}>
            {currentStory.author.displayName ?? currentStory.author.username}
          </Text>
          <Text style={styles.authorTime}>{timeAgo(currentStory.createdAt)}</Text>
        </View>
        <Pressable
          onPress={handleClose}
          style={styles.closeButton}
          accessibilityLabel="Close stories"
          hitSlop={12}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Tap zones (layered below header / close so they don't eat presses)  */}
      {/* ------------------------------------------------------------------ */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        delayLongPress={200}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Story content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.contentArea} pointerEvents="none">
        {isTextStory ? (
          <Text style={styles.storyText}>{currentStory.content}</Text>
        ) : (
          <Image
            source={{ uri: currentStory.imageUrl ?? undefined }}
            style={styles.storyImage}
            resizeMode="cover"
          />
        )}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* User group indicator dots (if viewing multiple groups)              */}
      {/* ------------------------------------------------------------------ */}
      {groups.length > 1 && (
        <View style={styles.groupDots} pointerEvents="none">
          {groups.map((g, idx) => (
            <View
              key={g.userId}
              style={[
                styles.groupDot,
                idx === groupIndex && styles.groupDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  errorText: {
    color: Colors.error,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  backBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // Progress bars
  progressRow: {
    position: 'absolute',
    top: 54,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
    zIndex: 20,
  },

  // Author header
  authorRow: {
    position: 'absolute',
    top: 68,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
    gap: 10,
  },
  authorInfo: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  authorTime: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.closeBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },

  // Content
  contentArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  storyText: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  storyImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  // Group dots
  groupDots: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  groupDotActive: {
    backgroundColor: Colors.white,
    width: 18,
  },
});
