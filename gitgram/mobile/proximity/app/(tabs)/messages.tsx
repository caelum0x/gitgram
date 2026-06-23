import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors — matches the dark gitgram palette used across the app
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationParticipant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Conversation {
  id: string;
  participant: ConversationParticipant;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 30) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function truncate(text: string | null, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 48 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();
  const radius = size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[avatarStyles.image, { width: size, height: size, borderRadius: radius }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.placeholder,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: {
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Unread badge
// ---------------------------------------------------------------------------

interface UnreadBadgeProps {
  count: number;
}

function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);

  return (
    <View style={badgeStyles.container}>
      <Text style={badgeStyles.text}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  text: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Conversation row
// ---------------------------------------------------------------------------

interface ConversationRowProps {
  conversation: Conversation;
  onPress: (id: string) => void;
}

function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const { participant, lastMessage, lastMessageAt, unreadCount } = conversation;
  const displayName = participant.displayName ?? participant.username;
  const preview = truncate(lastMessage, 50);
  const timestamp = relativeTime(lastMessageAt);
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      style={[rowStyles.container, hasUnread && rowStyles.unread]}
      activeOpacity={0.7}
      onPress={() => onPress(conversation.id)}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
    >
      <Avatar uri={participant.avatarUrl} username={participant.username} size={48} />

      <View style={rowStyles.body}>
        <View style={rowStyles.topLine}>
          <Text style={[rowStyles.username, hasUnread && rowStyles.usernameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          {timestamp ? (
            <Text style={rowStyles.timestamp}>{timestamp}</Text>
          ) : null}
        </View>
        <View style={rowStyles.bottomLine}>
          <Text style={rowStyles.preview} numberOfLines={1}>
            {preview || 'No messages yet'}
          </Text>
          <UnreadBadge count={unreadCount} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 12,
  },
  unread: {
    backgroundColor: Colors.surface,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  username: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  usernameUnread: {
    fontWeight: '700',
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 12,
    flexShrink: 0,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  preview: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
}

function SearchBar({ value, onChangeText }: SearchBarProps) {
  return (
    <View style={searchStyles.wrapper}>
      <TextInput
        style={searchStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search conversations..."
        placeholderTextColor={Colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel="Search conversations"
      />
    </View>
  );
}

const searchStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    height: 40,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{'💬'}</Text>
      <Text style={emptyStyles.heading}>No conversations yet</Text>
      <Text style={emptyStyles.body}>
        Start a conversation with someone to see it here.
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
    fontSize: 52,
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
// Skeleton row
// ---------------------------------------------------------------------------

function ConversationSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.avatar} />
      <View style={skeletonStyles.lines}>
        <View style={skeletonStyles.line1} />
        <View style={skeletonStyles.line2} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceElevated,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
  line1: {
    height: 13,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    width: '55%',
  },
  line2: {
    height: 11,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
    width: '80%',
  },
});

// ---------------------------------------------------------------------------
// Screen header
// ---------------------------------------------------------------------------

function ScreenHeader() {
  return (
    <View style={headerStyles.container}>
      <Text style={headerStyles.title}>Messages</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MessagesScreen() {
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // ----- Fetch conversations -----
  const loadConversations = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const data = await apiClient<ConversationsResponse>('/v1/messages/conversations');
      setConversations(data.conversations);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    }
  }, []);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    loadConversations().finally(() => setIsLoading(false));
  }, [loadConversations]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadConversations();
    setIsRefreshing(false);
  }, [isRefreshing, loadConversations]);

  // ----- Navigation -----
  const handleRowPress = useCallback(
    (id: string): void => {
      router.push(`/messages/${id}`);
    },
    [router],
  );

  // ----- Filtered list -----
  const filtered = useMemo<Conversation[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.participant.displayName ?? c.participant.username).toLowerCase();
      const username = c.participant.username.toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [conversations, query]);

  // ----- List helpers -----
  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow conversation={item} onPress={handleRowPress} />
    ),
    [handleRowPress],
  );

  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  // ----- Loading skeleton -----
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader />
        <SearchBar value={query} onChangeText={setQuery} />
        {Array.from({ length: 8 }, (_, i) => (
          <ConversationSkeleton key={i} />
        ))}
      </SafeAreaView>
    );
  }

  // ----- Error with empty list -----
  if (error && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader />
        <SearchBar value={query} onChangeText={setQuery} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>{'⚠️'}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setIsLoading(true);
              loadConversations().finally(() => setIsLoading(false));
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <SearchBar value={query} onChangeText={setQuery} />
      <FlatList<Conversation>
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyContent : undefined}
        removeClippedSubviews
        maxToRenderPerBatch={15}
        windowSize={10}
        initialNumToRender={15}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen-level styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyContent: {
    flex: 1,
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
});
