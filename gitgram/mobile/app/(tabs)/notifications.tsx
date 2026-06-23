import React, { useState, useEffect } from 'react';
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
import { notificationService } from '../../services/notificationService';
import { userService } from '../../services/userService';
import { useToast } from '../../hooks/useToast';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

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

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
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
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications((prev) =>
        prev.filter((n) => n.id !== notificationId)
      );
      showToast('Notification deleted', 'success');
    } catch (error) {
      showToast('Failed to delete notification', 'error');
    }
  };

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
          const repoId = getStringValue(notification.data, 'repoId');
          const postId = getStringValue(notification.data, 'postId');
          if (repoId) {
            router.push(`/repository/${repoId}`);
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const { icon, color } = getNotificationIcon(item.type);
    const userId = getStringValue(item.data, 'userId');
    const username = getStringValue(item.data, 'username') || 'user';
    const thumbnail = getStringValue(item.data, 'thumbnail');
    const isFollowing = userId ? followingUsers.has(userId) : false;
    const isLoading = userId ? followLoading.has(userId) : false;

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.isRead && styles.unreadNotification]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={[styles.iconBadge, { backgroundColor: color }]}>
            <Text style={styles.iconBadgeText}>{icon}</Text>
          </View>
        </View>
        <View style={styles.notificationContent}>
          <Text style={styles.notificationText}>
            <Text style={styles.usernameText}>@{username}</Text>{' '}
            {item.body}
          </Text>
          <Text style={styles.notificationTime}>{formatTime(item.createdAt)}</Text>
        </View>
        {thumbnail && (
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
        )}
        {item.type === 'follow' && userId && !isFollowing && (
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
        {item.type === 'follow' && userId && isFollowing && (
          <View style={[styles.followButton, styles.followingButton]}>
            <Text style={styles.followButtonText}>Following</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  const filteredNotifications = activeTab === 'you'
    ? notifications.filter(n => n.type !== 'following')
    : notifications.filter(n => n.type === 'following');

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
        data={filteredNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
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
