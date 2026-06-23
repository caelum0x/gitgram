import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colors — matches profile.tsx / index.tsx palette
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
  like: '#EF4444',
  likeInactive: '#475569',
  white: '#FFFFFF',
  success: '#34D399',
} as const;

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Rust: '#DEA584',
  Go: '#00ADD8',
  Java: '#B07219',
  Swift: '#FA7343',
  Kotlin: '#A97BFF',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Dart: '#00B4AB',
  Scala: '#C22D40',
  Haskell: '#5E5086',
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

const AUTH_TOKEN_KEY = 'accessToken';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
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
interface SnippetAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SnippetDetail {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
  author: SnippetAuthor;
}

interface LikeResponse {
  snippetId: string;
  likesCount: number;
  isLiked: boolean;
}

// ---------------------------------------------------------------------------
// Props — the route param [id] is passed as a prop in Expo Router
// ---------------------------------------------------------------------------
interface SnippetDetailProps {
  // Expo Router injects route params as a plain prop object.
  // When used with expo-router useLocalSearchParams, id comes in as string.
  id?: string;
}

// ---------------------------------------------------------------------------
// Author avatar (initials fallback, no image dependency required)
// ---------------------------------------------------------------------------
interface AuthorAvatarProps {
  username: string;
  size?: number;
}

function AuthorAvatar({ username, size = 36 }: AuthorAvatarProps) {
  const initial = (username[0] ?? '?').toUpperCase();

  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Language badge
// ---------------------------------------------------------------------------
interface LangBadgeProps {
  language: string;
}

function LangBadge({ language }: LangBadgeProps) {
  const color = LANGUAGE_COLORS[language] ?? Colors.textMuted;

  return (
    <View style={[badgeStyles.container, { borderColor: color }]}>
      <View style={[badgeStyles.dot, { backgroundColor: color }]} />
      <Text style={[badgeStyles.text, { color }]}>{language}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Copy button (clipboard interaction)
// ---------------------------------------------------------------------------
interface CopyButtonProps {
  code: string;
}

function CopyButton({ code }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      // expo-clipboard or @react-native-clipboard/clipboard
      // Dynamically import to avoid hard dependency at module level
      const Clipboard = await import('expo-clipboard').catch(async () => {
        const rn = await import('@react-native-clipboard/clipboard');
        return { setStringAsync: async (s: string) => { (rn.default as { setString(s: string): void }).setString(s); } };
      });
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable in this environment — silently ignore
    }
  }, [code]);

  return (
    <Pressable
      onPress={handleCopy}
      style={({ pressed }) => [
        copyStyles.btn,
        copied && copyStyles.btnCopied,
        pressed && copyStyles.btnPressed,
      ]}
      accessibilityLabel="Copy code"
    >
      <Text style={[copyStyles.label, copied && copyStyles.labelCopied]}>
        {copied ? 'Copied!' : 'Copy'}
      </Text>
    </Pressable>
  );
}

const copyStyles = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  btnCopied: {
    borderColor: Colors.success,
    backgroundColor: `${Colors.success}22`,
  },
  btnPressed: { opacity: 0.7 },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  labelCopied: { color: Colors.success },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SnippetDetailScreen({ id }: SnippetDetailProps) {
  const [snippet, setSnippet] = useState<SnippetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likeLoading, setLikeLoading] = useState(false);

  const snippetId = id ?? '';

  const loadSnippet = useCallback(async () => {
    if (!snippetId) {
      setError('Invalid snippet ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await authedFetch<SnippetDetail>(`/v1/snippets/${snippetId}`);
      setSnippet(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load snippet');
    } finally {
      setLoading(false);
    }
  }, [snippetId]);

  useEffect(() => {
    loadSnippet();
  }, [loadSnippet]);

  const handleLike = useCallback(async () => {
    if (!snippet || likeLoading) return;

    setLikeLoading(true);
    // Optimistic update
    setSnippet((prev) =>
      prev
        ? {
            ...prev,
            isLiked: !prev.isLiked,
            likesCount: prev.isLiked ? prev.likesCount - 1 : prev.likesCount + 1,
          }
        : prev,
    );

    try {
      const method = snippet.isLiked ? 'DELETE' : 'POST';
      const result = await authedFetch<LikeResponse>(
        `/v1/snippets/${snippet.id}/like`,
        { method },
      );
      setSnippet((prev) =>
        prev
          ? { ...prev, likesCount: result.likesCount, isLiked: result.isLiked }
          : prev,
      );
    } catch {
      // Revert optimistic update on failure
      setSnippet((prev) =>
        prev
          ? {
              ...prev,
              isLiked: !prev.isLiked,
              likesCount: prev.isLiked ? prev.likesCount - 1 : prev.likesCount + 1,
            }
          : prev,
      );
    } finally {
      setLikeLoading(false);
    }
  }, [snippet, likeLoading]);

  const handleBack = useCallback(() => {
    // Wire to router.back() or navigation.goBack()
  }, []);

  // ----- Loading state -----
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backIcon}>{'<'}</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ----- Error state -----
  if (error || !snippet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backIcon}>{'<'}</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Snippet not found'}</Text>
          <Pressable onPress={loadSnippet} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {snippet.title}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta row: author + language */}
        <View style={styles.metaRow}>
          <View style={styles.authorRow}>
            <AuthorAvatar username={snippet.author.username} size={36} />
            <View style={styles.authorInfo}>
              {snippet.author.displayName ? (
                <Text style={styles.authorDisplayName} numberOfLines={1}>
                  {snippet.author.displayName}
                </Text>
              ) : null}
              <Text style={styles.authorUsername}>@{snippet.author.username}</Text>
            </View>
          </View>
          <LangBadge language={snippet.language} />
        </View>

        {/* Title */}
        <Text style={styles.title}>{snippet.title}</Text>

        {/* Description */}
        {snippet.description ? (
          <Text style={styles.description}>{snippet.description}</Text>
        ) : null}

        {/* Code block */}
        <View style={styles.codeWrapper}>
          <View style={styles.codeToolbar}>
            <Text style={styles.codeToolbarLabel}>{snippet.language}</Text>
            <CopyButton code={snippet.code} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.codeScrollContent}
            style={styles.codeScrollView}
          >
            <Text style={styles.code} selectable>
              {snippet.code}
            </Text>
          </ScrollView>
        </View>

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Pressable
            onPress={handleLike}
            disabled={likeLoading}
            style={({ pressed }) => [
              styles.likeBtn,
              snippet.isLiked && styles.likeBtnActive,
              pressed && styles.btnPressed,
            ]}
            accessibilityLabel={snippet.isLiked ? 'Unlike snippet' : 'Like snippet'}
          >
            {likeLoading ? (
              <ActivityIndicator size="small" color={Colors.like} />
            ) : (
              <Text
                style={[
                  styles.likeIcon,
                  snippet.isLiked && styles.likeIconActive,
                ]}
              >
                {'♥'}
              </Text>
            )}
            <Text
              style={[
                styles.likeCount,
                snippet.isLiked && styles.likeCountActive,
              ]}
            >
              {formatCount(snippet.likesCount)}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  backIcon: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 36,
  },
  btnPressed: { opacity: 0.65 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorDisplayName: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  authorUsername: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '500',
  },

  // Title
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    lineHeight: 26,
  },

  // Description
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  // Code block
  codeWrapper: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  codeToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  codeToolbarLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  codeScrollView: {
    maxHeight: 400,
  },
  codeScrollContent: {
    padding: 16,
  },
  code: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: Colors.text,
    lineHeight: 20,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: 72,
    justifyContent: 'center',
  },
  likeBtnActive: {
    borderColor: Colors.like,
    backgroundColor: `${Colors.like}18`,
  },
  likeIcon: {
    fontSize: 18,
    color: Colors.likeInactive,
  },
  likeIconActive: {
    color: Colors.like,
  },
  likeCount: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  likeCountActive: {
    color: Colors.like,
  },

  // Centered states
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 22,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
