import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  Pressable,
  SafeAreaView,
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

const Colors = {
  background: '#000000',
  surface: '#0F0F1A',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
  progressTrack: 'rgba(255,255,255,0.35)',
  progressFill: '#FFFFFF',
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ViewStoryScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reacted, setReacted] = useState(false);
  const [showHeart, setShowHeart] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Fetch story
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await apiClient<Story>(`/api/v1/stories/${id}`);
        if (!cancelled) setStory(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load story.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Auto-advance timer
  const startTimer = useCallback(() => {
    progressAnim.setValue(0);

    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    progressAnimRef.current.start(({ finished }) => {
      if (finished) {
        router.back();
      }
    });

    timerRef.current = setTimeout(() => {
      router.back();
    }, STORY_DURATION_MS + 50);
  }, [progressAnim]);

  useEffect(() => {
    if (!loading && !error && story) {
      startTimer();
    }
    return () => {
      progressAnimRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading, error, story, startTimer]);

  const pauseProgress = useCallback(() => {
    progressAnimRef.current?.stop();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const resumeProgress = useCallback(() => {
    // Simple resume: restart from current value is complex — just advance from current point
    startTimer();
  }, [startTimer]);

  // Tap left / right halves
  const handleTap = useCallback((evt: GestureResponderEvent) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_WIDTH / 2) {
      // Tap left — restart current (could nav prev in a list scenario)
      progressAnimRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      startTimer();
    } else {
      // Tap right — skip / go back
      progressAnimRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      router.back();
    }
  }, [startTimer]);

  // Heart reaction
  const handleHeartReaction = useCallback(() => {
    if (reacted) return;
    setReacted(true);
    setShowHeart(true);
    heartScale.setValue(0);

    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(heartScale, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));
  }, [reacted, heartScale]);

  const handleClose = useCallback(() => {
    progressAnimRef.current?.stop();
    if (timerRef.current) clearTimeout(timerRef.current);
    router.back();
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading story…</Text>
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Story not found.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isTextStory = !story.imageUrl;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: isTextStory ? story.backgroundColor : Colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} translucent />

      {/* Tap zones */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        onLongPress={pauseProgress}
        onPressOut={resumeProgress}
      />

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Author row */}
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarInitials(story.author)}</Text>
        </View>
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>
            {story.author.displayName ?? story.author.username}
          </Text>
          <Text style={styles.authorTime}>{timeAgo(story.createdAt)}</Text>
        </View>
        <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close story">
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Story content */}
      <View style={styles.contentArea} pointerEvents="none">
        {isTextStory ? (
          <Text style={styles.storyText}>{story.content}</Text>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>📸</Text>
            <Text style={styles.imagePlaceholderHint}>{story.imageUrl}</Text>
          </View>
        )}
      </View>

      {/* Heart reaction */}
      <Pressable
        style={styles.reactionBtn}
        onPress={handleHeartReaction}
        accessibilityLabel={reacted ? 'Already reacted' : 'React with heart'}
      >
        <Text style={[styles.reactionIcon, reacted && styles.reactionIconActive]}>
          {reacted ? '❤️' : '🤍'}
        </Text>
      </Pressable>

      {/* Floating heart overlay */}
      {showHeart && (
        <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartScale }] }]}>
          <Text style={styles.heartOverlayIcon}>❤️</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
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

  // Progress bar
  progressTrack: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: Colors.progressTrack,
    borderRadius: 2,
    zIndex: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.progressFill,
    borderRadius: 2,
  },

  // Author row
  authorRow: {
    position: 'absolute',
    top: 68,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  authorInfo: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  authorTime: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Content
  contentArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  storyText: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  imagePlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  imagePlaceholderText: {
    fontSize: 64,
  },
  imagePlaceholderHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    maxWidth: SCREEN_WIDTH * 0.8,
    textAlign: 'center',
  },

  // Reaction
  reactionBtn: {
    position: 'absolute',
    bottom: 48,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  reactionIcon: {
    fontSize: 24,
  },
  reactionIconActive: {
    // tint handled by emoji swap
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
  heartOverlayIcon: {
    fontSize: 96,
  },
});
