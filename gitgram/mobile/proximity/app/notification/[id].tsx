import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient, followUser, type NotificationGroup } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Design tokens — matches notifications.tsx palette
// ---------------------------------------------------------------------------
const C = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  elevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  accent: '#4F46E5',
  error: '#F87171',
  success: '#10B981',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Type config
// ---------------------------------------------------------------------------
const TYPE_LABEL: Record<string, string> = {
  like: 'Post Like',
  comment: 'Comment',
  follow: 'New Follower',
  mention: 'Mention',
  star: 'Repository Star',
  pr_merged: 'PR Merged',
};

const TYPE_ICON: Record<string, string> = {
  like: '❤️',
  comment: '💬',
  follow: '👤',
  mention: '@',
  star: '⭐',
  pr_merged: '🔀',
};

const TYPE_COLOR: Record<string, string> = {
  like: '#EF4444',
  comment: '#7C3AED',
  follow: '#10B981',
  mention: '#F59E0B',
  star: '#FBBF24',
  pr_merged: '#8B5CF6',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actionText(type: string, actorName: string, count: number): string {
  const others = count - 1;
  const suffix = others > 0 ? ` and ${others} other${others === 1 ? '' : 's'}` : '';
  const subject = `${actorName}${suffix}`;

  switch (type) {
    case 'like':
      return `${subject} liked your post`;
    case 'comment':
      return `${subject} commented on your post`;
    case 'follow':
      return `${subject} started following you`;
    case 'mention':
      return `${subject} mentioned you in a post`;
    case 'star':
      return `${subject} starred your repository`;
    case 'pr_merged':
      return `${subject} merged a pull request`;
    default:
      return `${subject} interacted with you`;
  }
}

// ---------------------------------------------------------------------------
// Avatar with fallback
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string | null;
  username: string;
  size: number;
}

function Avatar({ uri, username, size }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Action button
// ---------------------------------------------------------------------------
interface ActionButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

function ActionButton({ label, onPress, loading = false, variant = 'primary' }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, variant === 'secondary' && styles.actionBtnSecondary]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? C.white : C.primaryLight} />
      ) : (
        <Text style={[styles.actionBtnText, variant === 'secondary' && styles.actionBtnTextSecondary]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/**
 * Notification detail screen.
 * Route: /notification/[id]  (id encodes "<type>::<entityId>::<actorId>")
 *
 * The full NotificationGroup is passed via router params as a JSON blob
 * (serialised from the notifications list), falling back to an API fetch
 * when navigated directly.
 */
export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id, data } = useLocalSearchParams<{ id: string; data?: string }>();

  const [group, setGroup] = useState<NotificationGroup | null>(() => {
    if (data) {
      try {
        return JSON.parse(data) as NotificationGroup;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(group === null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followDone, setFollowDone] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mark as read on mount
  useEffect(() => {
    if (!id) return;
    apiClient(`/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    }).catch(() => {
      // Non-fatal: best-effort read marking
    });
  }, [id]);

  // Fetch group data when not passed via params
  useEffect(() => {
    if (group !== null || !id) return;

    setIsLoading(true);
    apiClient<{ group: NotificationGroup }>(`/v1/notifications/${encodeURIComponent(id)}`)
      .then((res) => setGroup(res.group))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load notification');
      })
      .finally(() => setIsLoading(false));
  }, [id, group]);

  // Follow back handler
  const handleFollowBack = useCallback(async (): Promise<void> => {
    if (!group) return;
    setIsFollowing(true);
    try {
      await followUser(group.latestActor.username);
      setFollowDone(true);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to follow user');
    } finally {
      setIsFollowing(false);
    }
  }, [group]);

  // Delete notification
  const handleDelete = useCallback((): void => {
    Alert.alert(
      'Delete Notification',
      'Remove this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setIsDeleting(true);
            try {
              await apiClient(`/v1/notifications/${encodeURIComponent(id)}`, {
                method: 'DELETE',
              });
              router.back();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }, [id, router]);

  // Navigate to actor profile
  const handleViewProfile = useCallback((): void => {
    if (!group) return;
    router.push(`/profile/${group.latestActor.username}` as `/${string}`);
  }, [group, router]);

  // Navigate to entity (post / repo)
  const handleViewEntity = useCallback((): void => {
    if (!group?.entityId) return;
    if (group.entityType === 'post') {
      router.push(`/post/${group.entityId}` as `/${string}`);
    } else if (group.entityType === 'repository') {
      router.push(`/repo/${group.entityId}` as `/${string}`);
    }
  }, [group, router]);

  // ----- Loading -----
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onDelete={handleDelete} isDeleting={isDeleting} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ----- Error -----
  if (error || !group) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onDelete={handleDelete} isDeleting={isDeleting} />
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error ?? 'Notification not found'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const actor = group.latestActor;
  const actorName = actor.displayName ?? actor.username;
  const typeBadgeColor = TYPE_COLOR[group.type] ?? C.primary;
  const typeIcon = TYPE_ICON[group.type] ?? '!';
  const typeLabel = TYPE_LABEL[group.type] ?? 'Notification';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header onDelete={handleDelete} isDeleting={isDeleting} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Large type icon */}
        <View style={styles.iconSection}>
          <View style={[styles.iconCircle, { backgroundColor: typeBadgeColor + '22' }]}>
            <Text style={styles.iconEmoji}>{typeIcon}</Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          <Text style={styles.timestamp}>{formatFullDate(group.latestAt)}</Text>
        </View>

        {/* Actor card */}
        <TouchableOpacity
          style={styles.actorCard}
          onPress={handleViewProfile}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`View ${actorName}'s profile`}
        >
          <Avatar uri={actor.avatarUrl} username={actor.username} size={56} />
          <View style={styles.actorInfo}>
            <Text style={styles.actorName}>{actorName}</Text>
            <Text style={styles.actorUsername}>@{actor.username}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Action description */}
        <View style={styles.actionSection}>
          <Text style={styles.actionText}>
            {actionText(group.type, actorName, group.count)}
          </Text>
        </View>

        {/* Referenced content preview */}
        {group.entityId != null && (
          <View style={styles.entityCard}>
            <Text style={styles.entityLabel}>
              {group.entityType === 'post'
                ? 'Referenced post'
                : group.entityType === 'repository'
                ? 'Referenced repository'
                : 'Referenced content'}
            </Text>
            <Text style={styles.entityId} numberOfLines={1}>
              {group.entityId}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsSection}>
          {group.type === 'follow' && (
            <ActionButton
              label={followDone ? 'Following' : 'Follow Back'}
              onPress={handleFollowBack}
              loading={isFollowing}
              variant={followDone ? 'secondary' : 'primary'}
            />
          )}

          {(group.type === 'like' || group.type === 'mention' || group.type === 'comment') &&
            group.entityId != null && (
              <ActionButton
                label="View Post"
                onPress={handleViewEntity}
                variant="primary"
              />
            )}

          {group.type === 'star' && group.entityId != null && (
            <ActionButton
              label="View Repository"
              onPress={handleViewEntity}
              variant="primary"
            />
          )}

          {group.type === 'pr_merged' && group.entityId != null && (
            <ActionButton
              label="View Repository"
              onPress={handleViewEntity}
              variant="primary"
            />
          )}

          {group.type === 'comment' && group.entityId != null && (
            <ActionButton
              label="View Comment"
              onPress={handleViewEntity}
              variant="secondary"
            />
          )}

          <ActionButton
            label="View Profile"
            onPress={handleViewProfile}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Header sub-component
// ---------------------------------------------------------------------------
interface HeaderProps {
  onDelete: () => void;
  isDeleting: boolean;
}

function Header({ onDelete, isDeleting }: HeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.headerBtnText}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Notification</Text>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={onDelete}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel="Delete notification"
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color={C.error} />
        ) : (
          <Text style={[styles.headerBtnText, { color: C.error }]}>🗑</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: {
    color: C.primaryLight,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  headerTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    color: C.textSec,
    fontSize: 15,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryText: {
    color: C.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  // Icon section
  iconSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    gap: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 40,
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  typeBadgeText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timestamp: {
    color: C.textMuted,
    fontSize: 13,
  },
  // Actor card
  actorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 14,
  },
  avatarFallback: {
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.white,
    fontWeight: '700',
  },
  actorInfo: {
    flex: 1,
    gap: 3,
  },
  actorName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  actorUsername: {
    color: C.textMuted,
    fontSize: 13,
  },
  chevron: {
    color: C.textMuted,
    fontSize: 22,
    lineHeight: 26,
  },
  // Action description
  actionSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: C.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionText: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  // Entity card
  entityCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  entityLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  entityId: {
    color: C.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },
  // Actions
  actionsSection: {
    marginHorizontal: 16,
    marginTop: 24,
    gap: 10,
  },
  actionBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  actionBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    color: C.primaryLight,
  },
});
