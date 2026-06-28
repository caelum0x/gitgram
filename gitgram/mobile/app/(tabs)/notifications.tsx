import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import GestureActionView from '../../components/common/GestureActionView';
import {
  notificationService,
  groupNotifications,
  type Notification,
  type GroupedNotification,
} from '../../services/notificationService';
import { userService } from '../../services/userService';
import { useToast } from '../../hooks/useToast';
import { listenSoftReset } from '../../utils/events';
import { timeAgo } from '../../utils/timeAgo';

const getStringValue = (data: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());
  const { showToast, ToastComponent } = useToast();
  const listRef = useRef<FlatList<GroupedNotification>>(null);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
  }, []);

  // Soft reset: re-pressing the Notifications tab scrolls to top and reloads.
  useEffect(() => {
    const unlisten = listenSoftReset(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      loadNotifications();
      loadUnreadCount();
    });
    return unlisten;
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await notificationService.getNotifications();
      setNotifications(response.notifications || []);
    } catch (error) {
      showToast('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await notificationService.getUnreadCount();
      setUnreadCount(response.count || 0);
    } catch (error) {
      // Error handled silently
    }
  };

  const handleMarkAsRead = async (notificationId?: string) => {
    try {
      await notificationService.markAsRead(
        notificationId ? [notificationId] : undefined
      );
      await loadNotifications();
      await loadUnreadCount();
      showToast('Notifications marked as read', 'success');
    } catch (error) {
      showToast('Failed to mark as read', 'error');
    }
  };

  const handleDelete = async (notificationId: string) => {
    const snapshot = notifications;
    // Optimistic removal so the swiped row disappears immediately.
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    try {
      await notificationService.deleteNotification(notificationId);
      showToast('Notification deleted', 'success');
    } catch (error) {
      setNotifications(snapshot);
      showToast('Failed to delete notification', 'error');
    }
  };

  // Optimistic single-item mark-as-read used by the swipe action. Avoids the
  // full reload that handleMarkAsRead performs.
  const handleMarkOneRead = useCallback(
    async (notification: Notification) => {
      if (notification.isRead) {
        return;
      }
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, isRead: true } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await notificationService.markAsRead([notification.id]);
      } catch (error) {
        showToast('Failed to mark as read', 'error');
        loadNotifications();
        loadUnreadCount();
      }
    },
    [showToast],
  );

  const handleFollow = async (userId: string) => {
    if (!userId || followLoading.has(userId)) return;

    setFollowLoading((prev) => new Set(prev).add(userId));
    try {
      await userService.followUser(userId);
      setFollowingUsers((prev) => new Set(prev).add(userId));
      showToast('Following user', 'success');
    } catch (error) {
      showToast('Failed to follow user', 'error');
    } finally {
      setFollowLoading((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read when tapped
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'follow':
        {
          const userId = getStringValue(notification.data, 'userId');
          if (userId) {
            router.push(`/profile/${userId}`);
          }
        }
        break;
      case 'like':
      case 'comment':
        {
          const postId = getStringValue(notification.data, 'postId');
          if (postId) {
            router.push(`/post/${postId}`);
          }
        }
        break;
      case 'star':
        {
          const repoOwner = getStringValue(notification.data, 'repoOwner');
          const repoName = getStringValue(notification.data, 'repoName');
          const repoFullName = getStringValue(notification.data, 'repoFullName');
          const postId = getStringValue(notification.data, 'postId');
          // Repositories are addressed by owner/name (there is no id-based route).
          if (repoOwner && repoName) {
            router.push(`/repo/${repoOwner}/${repoName}`);
          } else if (repoFullName && repoFullName.includes('/')) {
            const [owner, name] = repoFullName.split('/');
            router.push(`/repo/${owner}/${name}`);
          } else if (postId) {
            router.push(`/post/${postId}`);
          }
        }
        break;
      default:
        // For other notification types, navigate to profile if userId available
        {
          const userId = getStringValue(notification.data, 'userId');
          if (userId) {
            router.push(`/profile/${userId}`);
          }
        }
        break;
    }
  };

  const [activeTab, setActiveTab] = useState<'following' | 'you'>('you');

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow':
        return { icon: '👤', color: '#3DDC97' };
      case 'comment':
        return { icon: '💬', color: '#4D96FF' };
      case 'like':
        return { icon: '❤️', color: '#FF477E' };
      case 'star':
        return { icon: '⭐', color: '#00F5D4' };
      default:
        return { icon: '🔔', color: Colors.primary };
    }
  };

  // Avatar entries for a grouped row's actor stack (deduped, base actor first).
  const getGroupActors = useCallback(
    (group: GroupedNotification): { username: string; avatar?: string }[] => {
      const all = [group.notification, ...group.additional];
      const seen = new Set<string>();
      const actors: { username: string; avatar?: string }[] = [];
      for (const n of all) {
        const username = getStringValue(n.data, 'username') || 'user';
        const userId = getStringValue(n.data, 'userId') || username;
        if (seen.has(userId)) continue;
        seen.add(userId);
        actors.push({ username, avatar: getStringValue(n.data, 'avatar') });
      }
      return actors;
    },
    [],
  );

  // Builds the aggregated headline, e.g. "@alice and 5 others liked your post".
  const buildGroupText = useCallback(
    (group: GroupedNotification): { actorLabel: string; body: string } => {
      const actors = getGroupActors(group);
      const primary = actors[0]?.username ?? 'user';
      const extra = group.actorCount - 1;
      const actorLabel =
        extra <= 0
          ? `@${primary}`
          : extra === 1 && actors[1]
          ? `@${primary} and @${actors[1].username}`
          : `@${primary} and ${extra} ${extra === 1 ? 'other' : 'others'}`;
      return { actorLabel, body: group.notification.body };
    },
    [getGroupActors],
  );

  const renderNotification = ({ item }: { item: GroupedNotification }) => {
    const base = item.notification;
    const { icon, color } = getNotificationIcon(base.type);
    const userId = getStringValue(base.data, 'userId');
    const thumbnail = getStringValue(base.data, 'thumbnail');
    const isFollowing = userId ? followingUsers.has(userId) : false;
    const isLoading = userId ? followLoading.has(userId) : false;
    const { actorLabel, body } = buildGroupText(item);
    const actors = getGroupActors(item);
    const isGroup = item.actorCount > 1;
    const ids = [base.id, ...item.additional.map((n) => n.id)];
    const allRead = base.isRead && item.additional.every((n) => n.isRead);

    return (
      <GestureActionView
        actions={{
          left: allRead
            ? undefined
            : {
                color: Colors.info,
                icon: 'done',
                label: 'Read',
                action: () => ids.forEach((id) => handleMarkOneRead({ ...base, id })),
              },
          right: {
            color: Colors.error,
            icon: 'delete',
            label: 'Delete',
            action: () => ids.forEach((id) => handleDelete(id)),
          },
        }}
      >
      <TouchableOpacity
        style={[styles.notificationItem, !allRead && styles.unreadNotification]}
        onPress={() => handleNotificationPress(base)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {isGroup ? (
            <View style={styles.avatarStack}>
              {actors.slice(0, 3).map((actor, idx) => (
                <View
                  key={`${actor.username}-${idx}`}
                  style={[styles.stackedAvatar, { left: idx * 18, zIndex: 3 - idx }]}
                >
                  {actor.avatar ? (
                    <Image source={{ uri: actor.avatar }} style={styles.stackedAvatarImg} />
                  ) : (
                    <View style={[styles.stackedAvatarImg, styles.stackedAvatarFallback]}>
                      <Text style={styles.stackedAvatarInitial}>
                        {actor.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
              <View style={[styles.miniBadge, { backgroundColor: color }]}>
                <Text style={styles.miniBadgeText}>{icon}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.iconBadge, { backgroundColor: color }]}>
              <Text style={styles.iconBadgeText}>{icon}</Text>
            </View>
          )}
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationText}>
            <Text style={styles.usernameText}>{actorLabel}</Text>{' '}
            {body}
          </Text>
          <Text style={styles.notificationTime}>{timeAgo(base.createdAt, { format: 'long' })} ago</Text>
        </View>
        {thumbnail && (
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
        )}
        {!isGroup && base.type === 'follow' && userId && !isFollowing && (
          <TouchableOpacity
            style={styles.followButton}
            onPress={(e) => {
              e.stopPropagation();
              handleFollow(userId);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.followButtonText}>Follow</Text>
            )}
          </TouchableOpacity>
        )}
        {!isGroup && base.type === 'follow' && userId && isFollowing && (
          <View style={[styles.followButton, styles.followingButton]}>
            <Text style={styles.followButtonText}>Following</Text>
          </View>
        )}
      </TouchableOpacity>
      </GestureActionView>
    );
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  const filteredNotifications = activeTab === 'you'
    ? notifications.filter(n => n.type !== 'following')
    : notifications.filter(n => n.type === 'following');

  const groupedNotifications = groupNotifications(filteredNotifications);

  return (
    <View style={styles.container}>
      {ToastComponent}
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <Text style={styles.headerTitle}>Activity</Text>
        <TouchableOpacity onPress={() => handleMarkAsRead()}>
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Buttons */}
      <View style={styles.segmentedContainer}>
        <View style={styles.segmentedButtons}>
          <TouchableOpacity
            style={[
              styles.segmentedButton,
              activeTab === 'following' && styles.segmentedButtonActive,
            ]}
            onPress={() => setActiveTab('following')}
          >
            <Text
              style={[
                styles.segmentedButtonText,
                activeTab === 'following' && styles.segmentedButtonTextActive,
              ]}
            >
              Following
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentedButton,
              activeTab === 'you' && styles.segmentedButtonActive,
            ]}
            onPress={() => setActiveTab('you')}
          >
            <Text
              style={[
                styles.segmentedButtonText,
                activeTab === 'you' && styles.segmentedButtonTextActive,
              ]}
            >
              You
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications List */}
      <FlatList
        ref={listRef}
        data={groupedNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.key}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>✓</Text>
            </View>
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyMessage}>
              You'll see new likes, comments, and follows here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerLeft: {
    width: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  markAllText: {
    color: '#4D96FF',
    fontSize: 14,
    fontWeight: '500',
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segmentedButtons: {
    flexDirection: 'row',
    height: 40,
    backgroundColor: '#1a222e',
    borderRadius: 8,
    padding: 2,
  },
  segmentedButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentedButtonActive: {
    backgroundColor: Colors.surface,
  },
  segmentedButtonText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  segmentedButtonTextActive: {
    color: Colors.text,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
  },
  unreadNotification: {
    backgroundColor: 'rgba(77, 150, 255, 0.08)',
  },
  avatarContainer: {
    position: 'relative',
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  iconBadgeText: {
    fontSize: 20,
  },
  avatarStack: {
    width: 84,
    height: 48,
    justifyContent: 'center',
  },
  stackedAvatar: {
    position: 'absolute',
  },
  stackedAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  stackedAvatarFallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackedAvatarInitial: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  miniBadge: {
    position: 'absolute',
    bottom: 0,
    left: 28,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  miniBadgeText: {
    fontSize: 11,
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  usernameText: {
    fontWeight: 'bold',
    color: '#4D96FF',
  },
  notificationTime: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  followButton: {
    height: 32,
    minWidth: 84,
    backgroundColor: '#4D96FF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  followingButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 96,
    paddingHorizontal: 16,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    fontSize: 32,
    color: '#3DDC97',
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  emptyMessage: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
