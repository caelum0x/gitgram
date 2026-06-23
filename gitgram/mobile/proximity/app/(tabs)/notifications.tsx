import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

import {
  apiClient,
  markAllRead,
  type NotificationGroup,
  type NotificationsResponse,
} from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (matches index.tsx / profile.tsx)
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
  white: '#FFFFFF',
  unreadDot: '#7C3AED', // purple to match brand
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'star';

type DateBucket = 'Today' | 'Yesterday' | 'This Week' | 'Earlier';

interface DateSection {
  title: DateBucket;
  data: NotificationGroup[];
}

// FlatList item: either a section header or a notification group
type ListItem =
  | { kind: 'header'; title: DateBucket }
  | { kind: 'row'; group: NotificationGroup };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dateBucket(iso: string): DateBucket {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Same calendar day
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return 'Today';
  }

  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  return 'Earlier';
}

function buildSections(groups: NotificationGroup[]): DateSection[] {
  const buckets: Record<DateBucket, NotificationGroup[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  for (const g of groups) {
    buckets[dateBucket(g.latestAt)].push(g);
  }

  const order: DateBucket[] = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  return order
    .filter((b) => buckets[b].length > 0)
    .map((b) => ({ title: b, data: buckets[b] }));
}

function flattenSections(sections: DateSection[]): ListItem[] {
  const items: ListItem[] = [];
  for (const section of sections) {
    items.push({ kind: 'header', title: section.title });
    for (const group of section.data) {
      items.push({ kind: 'row', group });
    }
  }
  return items;
}

function notificationText(group: NotificationGroup): string {
  const actor = group.latestActor.displayName ?? group.latestActor.username;
  const others = group.count - 1;
  const othersStr = others > 0 ? ` and ${others} other${others === 1 ? '' : 's'}` : '';
  const subject = `${actor}${othersStr}`;

  const type = group.type as NotificationType;

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
    default:
      return `${subject} interacted with you`;
  }
}

// Unique key for a notification group — combines type + entityId (if present)
function groupKey(group: NotificationGroup): string {
  return `${group.type}::${group.entityId ?? 'none'}::${group.latestActor.id}`;
}

// ---------------------------------------------------------------------------
// Type badge config
// ---------------------------------------------------------------------------

const TYPE_BADGE_EMOJI: Record<string, string> = {
  like: '❤️',
  comment: '💬',
  follow: '👤',
  mention: '@',
  star: '⭐',
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  like: '#EF4444',
  comment: '#7C3AED',
  follow: '#10B981',
  mention: '#F59E0B',
  star: '#FBBF24',
};

// ---------------------------------------------------------------------------
// Avatar component (with optional stacking for actorCount > 1)
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function SingleAvatar({ uri, username, size = 44 }: AvatarProps) {
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

// Stacked avatar wrapper: shows the primary actor avatar with a "+N" badge when
// actorCount > 1
interface StackedAvatarProps {
  primaryActor: NotificationGroup['latestActor'];
  actorCount: number;
  size?: number;
}

function StackedAvatar({ primaryActor, actorCount, size = 44 }: StackedAvatarProps) {
  const showBadge = actorCount > 1;

  return (
    <View style={[stackedStyles.wrapper, { width: size + (showBadge ? 12 : 0), height: size }]}>
      <SingleAvatar
        uri={primaryActor.avatarUrl}
        username={primaryActor.username}
        size={size}
      />
      {showBadge ? (
        <View
          style={[
            stackedStyles.badge,
            {
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: (size * 0.55) / 2,
              right: 0,
              bottom: 0,
            },
          ]}
        >
          <Text
            style={[stackedStyles.badgeText, { fontSize: size * 0.18 }]}
            numberOfLines={1}
          >
            +{actorCount - 1}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const stackedStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  badgeText: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Post thumbnail (small, right-side) for like/comment/mention notifications
// ---------------------------------------------------------------------------
interface PostThumbnailProps {
  mediaUrl: string | null;
  size?: number;
}

function PostThumbnail({ mediaUrl, size = 48 }: PostThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!mediaUrl || failed) return null;

  return (
    <Image
      source={{ uri: mediaUrl }}
      style={[
        thumbnailStyles.image,
        { width: size, height: size, borderRadius: 6 },
      ]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const thumbnailStyles = StyleSheet.create({
  image: {
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Type icon badge (small colored pill on the avatar corner)
// ---------------------------------------------------------------------------
interface TypeBadgeProps {
  type: string;
}

function TypeBadge({ type }: TypeBadgeProps) {
  const label = TYPE_BADGE_EMOJI[type] ?? '!';
  const bg = TYPE_BADGE_COLOR[type] ?? Colors.primary;

  return (
    <View style={[typeBadgeStyles.container, { backgroundColor: bg }]}>
      <Text style={typeBadgeStyles.label}>{label}</Text>
    </View>
  );
}

const typeBadgeStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  label: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Date section header
// ---------------------------------------------------------------------------
interface SectionHeaderProps {
  title: DateBucket;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <View style={sectionHeaderStyles.container}>
      <Text style={sectionHeaderStyles.title}>{title}</Text>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------
interface NotificationRowProps {
  group: NotificationGroup;
  onPress: (group: NotificationGroup) => void;
  onDelete: (group: NotificationGroup) => void;
}

function NotificationRow({ group, onPress, onDelete }: NotificationRowProps) {
  const hasPostEntity = group.entityType === 'post' && group.entityId != null;
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.8],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={rowStyles.deleteAction}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete(group);
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <Animated.Text style={[rowStyles.deleteIcon, { transform: [{ scale }] }]}>
            🗑
          </Animated.Text>
        </TouchableOpacity>
      );
    },
    [group, onDelete],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <TouchableOpacity
        style={[rowStyles.container, !group.read && rowStyles.unread]}
        activeOpacity={0.7}
        onPress={() => onPress(group)}
        accessibilityRole="button"
        accessibilityLabel={notificationText(group)}
      >
        {/* Left: stacked avatar + type badge */}
        <View style={rowStyles.avatarWrapper}>
          <StackedAvatar
            primaryActor={group.latestActor}
            actorCount={group.count}
            size={44}
          />
          <TypeBadge type={group.type} />
        </View>

        {/* Middle: text + timestamp */}
        <View style={rowStyles.textBlock}>
          <Text style={[rowStyles.text, !group.read && rowStyles.textUnread]} numberOfLines={2}>
            {notificationText(group)}
          </Text>
          <Text style={rowStyles.timestamp}>{timeAgo(group.latestAt)}</Text>
        </View>

        {/* Right: post thumbnail (if applicable) + unread dot */}
        <View style={rowStyles.right}>
          {hasPostEntity ? (
            <PostThumbnail mediaUrl={null} size={48} />
          ) : null}
          {!group.read ? <View style={rowStyles.unreadDot} /> : null}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 12,
  },
  unread: {
    backgroundColor: Colors.surface,
  },
  avatarWrapper: {
    position: 'relative',
    width: 56,
    height: 44,
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  textUnread: {
    color: Colors.text,
    fontWeight: '500',
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 20,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.unreadDot,
  },
  deleteAction: {
    width: 72,
    backgroundColor: '#EF444422',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deleteIcon: {
    fontSize: 22,
  },
});

// ---------------------------------------------------------------------------
// Skeleton loader row
// ---------------------------------------------------------------------------
function NotificationSkeleton() {
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: '80%',
  },
  line2: {
    height: 11,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
    width: '35%',
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>🔔</Text>
      <Text style={emptyStyles.heading}>No notifications yet</Text>
      <Text style={emptyStyles.body}>
        When someone likes, comments, follows you, or stars your repository, it will show up here.
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
// Main screen
// ---------------------------------------------------------------------------
export default function NotificationsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- Derived: flat list items with section headers -----
  const listItems: ListItem[] = React.useMemo(() => {
    if (groups.length === 0) return [];
    return flattenSections(buildSections(groups));
  }, [groups]);

  // ----- Fetch grouped notifications -----
  const loadNotifications = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const data = await apiClient<NotificationsResponse>(
        '/v1/notifications/grouped?limit=50',
      );
      setGroups(data.groups);
      setUnreadCount(data.unreadCount);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    }
  }, []);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    loadNotifications().finally(() => setIsLoading(false));
  }, [loadNotifications]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadNotifications();
    setIsRefreshing(false);
  }, [isRefreshing, loadNotifications]);

  // ----- Mark all read -----
  const handleMarkAllRead = useCallback(async (): Promise<void> => {
    if (isMarkingRead || unreadCount === 0) return;
    setIsMarkingRead(true);
    // Optimistic update first
    setGroups((prev) => prev.map((g) => ({ ...g, read: true })));
    setUnreadCount(0);
    try {
      await markAllRead();
    } catch {
      // Roll back optimistic update on failure
      await loadNotifications();
    } finally {
      setIsMarkingRead(false);
    }
  }, [isMarkingRead, unreadCount, loadNotifications]);

  // ----- Row tap: optimistically mark as read, navigate to detail -----
  const handleRowPress = useCallback((group: NotificationGroup): void => {
    if (!group.read) {
      setGroups((prev) =>
        prev.map((g) =>
          groupKey(g) === groupKey(group) ? { ...g, read: true } : g,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    const id = groupKey(group);
    router.push({
      pathname: '/notification/[id]',
      params: { id, data: JSON.stringify(group) },
    });
  }, [router]);

  // ----- Row swipe-delete: remove from list, fire DELETE request -----
  const handleDeleteGroup = useCallback((group: NotificationGroup): void => {
    const id = groupKey(group);
    setGroups((prev) => prev.filter((g) => groupKey(g) !== id));
    if (!group.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    apiClient(`/v1/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => {
      // Non-fatal: item already removed from local state
    });
  }, []);

  // ----- Render list item -----
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return <SectionHeader title={item.title} />;
      }
      return (
        <NotificationRow
          group={item.group}
          onPress={handleRowPress}
          onDelete={handleDeleteGroup}
        />
      );
    },
    [handleRowPress, handleDeleteGroup],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.kind === 'header') return `header::${item.title}`;
    return groupKey(item.group);
  }, []);

  // ----- Loading skeleton -----
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          unreadCount={unreadCount}
          isMarkingRead={isMarkingRead}
          onMarkAllRead={handleMarkAllRead}
        />
        {Array.from({ length: 8 }, (_, i) => (
          <NotificationSkeleton key={i} />
        ))}
      </SafeAreaView>
    );
  }

  // ----- Error with empty list -----
  if (error && groups.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          unreadCount={0}
          isMarkingRead={false}
          onMarkAllRead={handleMarkAllRead}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setIsLoading(true);
              loadNotifications().finally(() => setIsLoading(false));
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        unreadCount={unreadCount}
        isMarkingRead={isMarkingRead}
        onMarkAllRead={handleMarkAllRead}
      />
      <FlatList<ListItem>
        data={listItems}
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
        contentContainerStyle={listItems.length === 0 ? styles.emptyContent : undefined}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        windowSize={10}
        initialNumToRender={20}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen header (extracted to avoid re-creating inline in JSX)
// ---------------------------------------------------------------------------
interface ScreenHeaderProps {
  unreadCount: number;
  isMarkingRead: boolean;
  onMarkAllRead: () => void;
}

function ScreenHeader({ unreadCount, isMarkingRead, onMarkAllRead }: ScreenHeaderProps) {
  const canMarkRead = unreadCount > 0 && !isMarkingRead;

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.titleRow}>
        <Text style={headerStyles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={headerStyles.badge}>
            <Text style={headerStyles.badgeText}>
              {unreadCount > 99 ? '99+' : String(unreadCount)}
            </Text>
          </View>
        )}
      </View>
      <Pressable
        onPress={onMarkAllRead}
        disabled={!canMarkRead}
        accessibilityRole="button"
        accessibilityLabel="Mark all notifications as read"
        style={({ pressed }) => [
          headerStyles.markAllBtn,
          pressed && headerStyles.markAllBtnPressed,
        ]}
      >
        {isMarkingRead ? (
          <ActivityIndicator size="small" color={Colors.primaryLight} />
        ) : (
          <Text
            style={[
              headerStyles.markAllText,
              !canMarkRead && headerStyles.markAllTextDisabled,
            ]}
          >
            Mark all read
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  markAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  markAllBtnPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  markAllText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  markAllTextDisabled: {
    color: Colors.textMuted,
  },
});

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
