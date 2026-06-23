import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { scheduledPostsService } from '../../services/scheduledPostsService';
import { logger } from '../../utils/logger';

interface ScheduledPost {
  id: string;
  content: string;
  mediaUrls: string[];
  scheduledAt: string;
  status: 'pending' | 'published' | 'failed';
  createdAt: string;
}

export default function ScheduledPostsScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadScheduledPosts();
  }, []);

  const loadScheduledPosts = async () => {
    try {
      setLoading(true);
      const response = await scheduledPostsService.getScheduledPosts();
      setPosts(response.scheduledPosts || response || []);
    } catch (error) {
      logger.error('Load scheduled posts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadScheduledPosts();
    setRefreshing(false);
  }, []);

  const handleDelete = (postId: string) => {
    Alert.alert(
      'Delete Scheduled Post',
      'Are you sure you want to delete this scheduled post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(postId);
              await scheduledPostsService.deleteScheduledPost(postId);
              setPosts(posts.filter((p) => p.id !== postId));
            } catch (error) {
              logger.error('Delete scheduled post error:', error);
              Alert.alert('Error', 'Failed to delete scheduled post');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const formatScheduledTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${timeStr}`;
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return Colors.warning;
      case 'published':
        return Colors.success;
      case 'failed':
        return Colors.error;
      default:
        return Colors.muted;
    }
  };

  const renderPost = ({ item }: { item: ScheduledPost }) => (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          />
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
        <Text style={styles.scheduledTime}>
          {formatScheduledTime(item.scheduledAt)}
        </Text>
      </View>

      <Text style={styles.content} numberOfLines={3}>
        {item.content || '(No content)'}
      </Text>

      {item.mediaUrls && item.mediaUrls.length > 0 && (
        <View style={styles.mediaContainer}>
          {item.mediaUrls.slice(0, 4).map((url, index) => (
            <View key={index} style={styles.mediaThumbnail}>
              <Text style={styles.mediaIcon}>
                {url.includes('video') ? '🎬' : '🖼️'}
              </Text>
            </View>
          ))}
          {item.mediaUrls.length > 4 && (
            <Text style={styles.moreMedia}>+{item.mediaUrls.length - 4}</Text>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {item.status === 'pending' && (
          <>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/scheduled/${item.id}/edit`)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id)}
              disabled={deletingId === item.id}
            >
              <Text style={styles.deleteButtonText}>
                {deletingId === item.id ? '...' : 'Delete'}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {item.status === 'failed' && (
          <TouchableOpacity style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Scheduled Posts" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Scheduled Posts"
        rightComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/compose?schedule=true')}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        }
      />

      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      ) : (
        <EmptyState
          title="No scheduled posts"
          message="Schedule posts to publish them later"
          icon="📅"
          actionLabel="Schedule Post"
          onAction={() => router.push('/compose?schedule=true')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  postCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: Colors.muted,
    textTransform: 'capitalize',
  },
  scheduledTime: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
  },
  content: {
    fontSize: 14,
    color: Colors.foreground,
    lineHeight: 20,
  },
  mediaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  mediaThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaIcon: {
    fontSize: 16,
  },
  moreMedia: {
    fontSize: 12,
    color: Colors.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.muted,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.foreground,
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: `${Colors.error}20`,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.error,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 20,
    color: Colors.white,
    fontWeight: '600',
    lineHeight: 22,
  },
});
