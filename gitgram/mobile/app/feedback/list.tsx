import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { feedbackService } from '../../services/feedbackService';

export default function FeedbackListScreen() {
  const router = useRouter();
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const loadFeedbacks = async () => {
    try {
      setLoading(true);
      const response = await feedbackService.getFeedbacks();
      setFeedbacks(response.feedbacks || []);
    } catch (error) {
      logger.error('Load feedbacks error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return Colors.accent;
      case 'in-progress':
        return Colors.accent;
      case 'resolved':
        return '#4caf50';
      case 'closed':
        return Colors.textSecondary;
      default:
        return Colors.textSecondary;
    }
  };

  const renderFeedback = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.feedbackItem}
      onPress={() => router.push(`/feedback/${item.id}`)}
    >
      <View style={styles.feedbackHeader}>
        <Text style={styles.feedbackSubject}>{item.subject}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        >
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.feedbackCategory}>{item.category}</Text>
      <Text style={styles.feedbackMessage} numberOfLines={2}>
        {item.message}
      </Text>
      <Text style={styles.feedbackDate}>
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="My Feedback" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="My Feedback"
        rightIcon="add"
        onRightPress={() => router.push('/feedback/create')}
      />
      {feedbacks.length > 0 ? (
        <FlatList
          data={feedbacks}
          renderItem={renderFeedback}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No feedback submitted"
          message="Your feedback helps us improve Gitgram"
          icon="💬"
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
    padding: 16,
  },
  feedbackItem: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  feedbackSubject: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  feedbackCategory: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  feedbackMessage: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  feedbackDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

