import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';
import type { UserProfile } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Color palette — matches the gitgram dark theme
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
  success: '#22C55E',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

type UserSummary = Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;

interface RecentInteractionsResponse {
  users: UserSummary[];
}

interface UserSearchResponse {
  users: UserSummary[];
}

interface CreateConversationResponse {
  conversation: {
    id: string;
    participantId: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Debounce hook — returns the value only after `delay` ms of no changes. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 44 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();
  const radius = size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
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
// UserRow — single result / suggestion item
// ---------------------------------------------------------------------------

interface UserRowProps {
  user: UserSummary;
  onPress: (user: UserSummary) => void;
  isLoading: boolean;
}

function UserRow({ user, onPress, isLoading }: UserRowProps) {
  const displayName = user.displayName ?? user.username;

  return (
    <TouchableOpacity
      style={userRowStyles.container}
      activeOpacity={0.7}
      onPress={() => onPress(user)}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={`Start conversation with ${displayName}`}
    >
      <Avatar uri={user.avatarUrl} username={user.username} size={44} />

      <View style={userRowStyles.info}>
        <Text style={userRowStyles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        {user.displayName ? (
          <Text style={userRowStyles.username} numberOfLines={1}>
            @{user.username}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Text style={userRowStyles.arrow}>{'›'}</Text>
      )}
    </TouchableOpacity>
  );
}

const userRowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  username: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  arrow: {
    color: Colors.textMuted,
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
});

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.text}>{title}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  text: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NewMessageScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const [suggestedUsers, setSuggestedUsers] = useState<UserSummary[]>([]);
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [creatingForId, setCreatingForId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep track of in-flight search to discard stale responses
  const searchAbortRef = useRef<AbortController | null>(null);

  // ----- Load recently interacted users on mount -----
  useEffect(() => {
    let cancelled = false;

    setIsSuggestionsLoading(true);
    apiClient<RecentInteractionsResponse>('/v1/users/recent-interactions')
      .then((data) => {
        if (!cancelled) {
          setSuggestedUsers(data.users.slice(0, 5));
        }
      })
      .catch(() => {
        // Suggestions are best-effort; silently skip on failure
      })
      .finally(() => {
        if (!cancelled) setIsSuggestionsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ----- Search users whenever debounced query changes -----
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    if (!trimmed) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    // Cancel any previous in-flight request
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearchLoading(true);
    setError(null);

    apiClient<UserSearchResponse>(
      `/v1/users/search?q=${encodeURIComponent(trimmed)}`,
      { signal: controller.signal } as RequestInit,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setSearchResults(data.users);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Search failed. Try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearchLoading(false);
        }
      });

    return () => { controller.abort(); };
  }, [debouncedQuery]);

  // ----- Create (or retrieve) conversation and navigate -----
  const handleUserPress = useCallback(
    async (user: UserSummary): Promise<void> => {
      if (creatingForId) return;

      setCreatingForId(user.id);
      setError(null);

      try {
        const data = await apiClient<CreateConversationResponse>(
          '/v1/messages/conversations',
          {
            method: 'POST',
            body: JSON.stringify({ participantId: user.id }),
          },
        );

        router.replace(`/messages/${data.conversation.id}`);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Could not start conversation.',
        );
        setCreatingForId(null);
      }
    },
    [creatingForId, router],
  );

  // ----- Derived list data -----
  const isSearching = debouncedQuery.trim().length > 0;

  // Combine section headers + users into a flat array for a single FlatList
  type ListItem =
    | { kind: 'section'; title: string; key: string }
    | { kind: 'user'; user: UserSummary; key: string }
    | { kind: 'empty'; message: string; key: string }
    | { kind: 'error'; message: string; key: string };

  const listData = useMemo<ListItem[]>(() => {
    if (isSearching) {
      if (isSearchLoading) return [];

      if (error) {
        return [{ kind: 'error', message: error, key: 'error' }];
      }

      if (searchResults.length === 0) {
        return [
          {
            kind: 'empty',
            message: `No users found for "${debouncedQuery.trim()}"`,
            key: 'empty-search',
          },
        ];
      }

      return searchResults.map<ListItem>((u) => ({ kind: 'user', user: u, key: u.id }));
    }

    // Not searching — show suggestions
    const items: ListItem[] = [];

    if (!isSuggestionsLoading && suggestedUsers.length > 0) {
      items.push({ kind: 'section', title: 'Suggested', key: 'section-suggested' });
      suggestedUsers.forEach((u) =>
        items.push({ kind: 'user', user: u, key: u.id }),
      );
    }

    return items;
  }, [
    isSearching,
    isSearchLoading,
    error,
    searchResults,
    debouncedQuery,
    isSuggestionsLoading,
    suggestedUsers,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'section') {
        return <SectionLabel title={item.title} />;
      }

      if (item.kind === 'user') {
        return (
          <UserRow
            user={item.user}
            onPress={handleUserPress}
            isLoading={creatingForId === item.user.id}
          />
        );
      }

      if (item.kind === 'empty') {
        return (
          <View style={styles.centeredMessage}>
            <Text style={styles.centeredText}>{item.message}</Text>
          </View>
        );
      }

      // error row
      return (
        <View style={styles.centeredMessage}>
          <Text style={styles.errorText}>{item.message}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              // Retrigger by bumping query to itself (force effect re-run)
              setQuery((q) => q);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    },
    [handleUserPress, creatingForId],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeIcon}>{'✕'}</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>New Message</Text>

        {/* Spacer to center title */}
        <View style={styles.closeButton} />
      </View>

      {/* Search input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Text style={styles.toLabel}>To:</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search users..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search for a user"
          />
          {(isSearchLoading || isSuggestionsLoading) ? (
            <ActivityIndicator
              size="small"
              color={Colors.primaryLight}
              style={styles.searchSpinner}
            />
          ) : null}
        </View>
      </View>

      {/* Results / suggestions list */}
      <FlatList<ListItem>
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listData.length === 0 ? styles.listEmpty : undefined}
        ListEmptyComponent={
          isSearchLoading || isSuggestionsLoading ? null : (
            <View style={styles.centeredMessage}>
              <Text style={styles.centeredText}>
                {isSearching ? '' : 'Search for someone to message'}
              </Text>
            </View>
          )
        }
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

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '400',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Search row
  searchContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 26,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    paddingVertical: 4,
  },
  searchSpinner: {
    marginLeft: 4,
  },

  // List states
  listEmpty: {
    flex: 1,
  },
  centeredMessage: {
    paddingTop: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  centeredText: {
    color: Colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    color: Colors.error,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  retryButton: {
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
