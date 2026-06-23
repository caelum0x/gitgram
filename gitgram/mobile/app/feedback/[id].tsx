import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { logger } from '../../utils/logger';
import { feedbackService } from '../../services/feedbackService';

export default function FeedbackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadFeedback(id);
    }
  }, [id]);

  const loadFeedback = async (feedbackId: string) => {
    try {
      setLoading(true);
      const response = await feedbackService.getFeedback(feedbackId);
      setFeedback(response.feedback || response);
    } catch (error) {
      logger.error('Load feedback error:', error);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Feedback" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!feedback) {
    return (
      <View style={styles.container}>
        <Header title="Feedback" />
        <EmptyState title="Feedback not found" message="This feedback could not be found" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Feedback" />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.subject}>{feedback.subject}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(feedback.status) },
            ]}
          >
            <Text style={styles.statusText}>{feedback.status}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <Text style={styles.metaLabel}>Category:</Text>
          <Text style={styles.metaValue}>{feedback.category}</Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.metaLabel}>Submitted:</Text>
          <Text style={styles.metaValue}>
            {new Date(feedback.createdAt).toLocaleString()}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Message</Text>
          <Text style={styles.message}>{feedback.message}</Text>
        </View>

        {feedback.response && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Response</Text>
            <Text style={styles.response}>{feedback.response}</Text>
          </View>
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
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  subject: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  meta: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  metaValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  response: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 8,
  },
});

