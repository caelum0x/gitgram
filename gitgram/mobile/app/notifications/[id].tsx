import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { notificationService } from '../../services/notificationService';
import { logger } from '../../utils/logger';

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [notification, setNotification] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadNotification(id);
    }
  }, [id]);

  const loadNotification = async (notificationId: string) => {
    try {
      const response = await notificationService.getNotification(notificationId);
      setNotification(response.notification || response);
      // Mark as read
      await notificationService.markAsRead([notificationId]);
    } catch (error) {
      logger.error('Load notification error:', error);
      Alert.alert('Error', 'Failed to load notification');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleAction = () => {
    if (!notification) return;

    // Navigate based on notification type
    switch (notification.type) {
      case 'like':
      case 'comment':
        if (notification.data?.postId) {
          router.push(`/post/${notification.data.postId}`);
        }
        break;
      case 'follow':
        if (notification.data?.userId) {
          router.push(`/profile/${notification.data.userId}`);
        }
        break;
      case 'message':
        if (notification.data?.userId) {
          router.push(`/chat/${notification.data.userId}`);
        }
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Notification" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!notification) {
    return (
      <View style={styles.container}>
        <Header title="Notification" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Notification not found</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Notification" />
      <View style={styles.content}>
        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.body}>{notification.body}</Text>
        <Text style={styles.time}>
          {new Date(notification.createdAt).toLocaleString()}
        </Text>

        {notification.data && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleAction}
          >
            <Text style={styles.actionButtonText}>View</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 24,
  },
  time: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  actionButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
});

