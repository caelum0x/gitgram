import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette
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
  error: '#F87171',
  success: '#34D399',
  white: '#FFFFFF',
  danger: '#EF4444',
} as const;

// ---------------------------------------------------------------------------
// API helpers
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
type ListType = 'following' | 'followers';

interface UserSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount?: number;
  isFollowing?: boolean;
}

interface UserListResponse {
  users: UserSummary[];
  total?: number;
  nextCursor?: string | null;
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 44 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[
          avatarStyles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: {
    backgroundColor: Colors.surfaceElevated,
  },
  placeholder: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Follow button component
// ---------------------------------------------------------------------------
interface FollowButtonProps {
  isFollowing: boolean;
  onPress: () => void;
  loading: boolean;
}

function FollowButton({ isFollowing, onPress, loading }: FollowButtonProps) {
  return (
    <Pressable
      style={[styles.followButton, isFollowing && styles.followButtonActive]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isFollowing ? Colors.primary : Colors.white} />
      ) : (
        <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// User row component
// ---------------------------------------------------------------------------
interface UserRowProps {
  user: UserSummary;
  onPress: () => void;
  onFollowToggle: () => void;
  followLoading: boolean;
}

function UserRow({ user, onPress, onFollowToggle, followLoading }: UserRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.userRow, pressed && styles.userRowPressed]}
      onPress={onPress}
    >
      <Avatar uri={user.avatarUrl} username={user.username} size={44} />

      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {user.displayName ?? user.username}
        </Text>
        <Text style={styles.userHandle} numberOfLines={1}>
          @{user.username}
          {typeof user.followersCount === 'number'
            ? `  ·  ${formatCount(user.followersCount)} followers`
            : ''}
        </Text>
        {user.bio ? (
          <Text style={styles.userBio} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
      </View>

      <FollowButton
        isFollowing={user.isFollowing ?? false}
        onPress={onFollowToggle}
        loading={followLoading}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FollowingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; username?: string }>();

  const listType: ListType = params.type === 'followers' ? 'followers' : 'following';
  const username = params.username ?? '';

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followLoadingIds, setFollowLoadingIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState<number | null>(null);

  const fetchUsers = useCallback(
    async (isRefresh = false) => {
      if (!username) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const endpoint =
          listType === 'following'
            ? `/v1/users/${username}/following`
            : `/v1/users/${username}/followers`;

        const data = await authedFetch<UserListResponse>(endpoint);
        setUsers(data.users ?? []);
        if (typeof data.total === 'number') setTotal(data.total);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [username, listType],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleFollowToggle = useCallback(
    async (user: UserSummary) => {
      setFollowLoadingIds((prev) => new Set(prev).add(user.id));

      const wasFollowing = user.isFollowing ?? false;

      // Optimistic update
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? {
                ...u,
                isFollowing: !wasFollowing,
                followersCount:
                  typeof u.followersCount === 'number'
                    ? u.followersCount + (wasFollowing ? -1 : 1)
                    : u.followersCount,
              }
            : u,
        ),
      );

      try {
        if (wasFollowing) {
          await authedFetch(`/v1/users/${user.username}/follow`, { method: 'DELETE' });
        } else {
          await authedFetch(`/v1/users/${user.username}/follow`, { method: 'POST' });
        }
      } catch (err: unknown) {
        // Revert optimistic update on failure
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  isFollowing: wasFollowing,
                  followersCount:
                    typeof u.followersCount === 'number'
                      ? u.followersCount + (wasFollowing ? 1 : -1)
                      : u.followersCount,
                }
              : u,
          ),
        );
        Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
      } finally {
        setFollowLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    },
    [],
  );

  const renderUser = useCallback(
    ({ item }: { item: UserSummary }) => (
      <UserRow
        user={item}
        onPress={() => router.push(`/profile/${item.username}` as never)}
        onFollowToggle={() => handleFollowToggle(item)}
        followLoading={followLoadingIds.has(item.id)}
      />
    ),
    [router, handleFollowToggle, followLoadingIds],
  );

  const keyExtractor = useCallback((item: UserSummary) => item.id, []);

  const headerCount = total ?? users.length;
  const headerLabel =
    listType === 'following'
      ? `${formatCount(headerCount)} Following`
      : `${formatCount(headerCount)} Followers`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{headerLabel}</Text>
          {username ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              @{username}
            </Text>
          ) : null}
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      {loading && users.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchUsers()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{listType === 'following' ? '👥' : '👤'}</Text>
              <Text style={styles.emptyTitle}>
                {listType === 'following' ? 'Not following anyone yet' : 'No followers yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {listType === 'following'
                  ? 'Follow developers to see their posts'
                  : 'Share your profile to get followers'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchUsers(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: Colors.text,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // List
  listContent: {
    paddingBottom: 32,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 72,
  },

  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  userRowPressed: {
    backgroundColor: Colors.surface,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  userHandle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  userBio: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Follow button
  followButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  followButtonTextActive: {
    color: Colors.textSecondary,
  },

  // Loading / error / empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: Colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
