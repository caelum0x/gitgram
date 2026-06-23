import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Image } from 'expo-image';
import { logger } from '../../../utils/logger';
import { storyService } from '../../../services/storyService';

interface Reply {
  id: string;
  content: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  createdAt: string;
}

export default function StoryRepliesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReplies();
  }, [id]);

  const loadReplies = async () => {
    try {
      const response = await storyService.getStoryReplies(id!);
      setReplies(response.replies || []);
    } catch (error) {
      logger.error('Load replies error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderReply = ({ item }: { item: Reply }) => (
    <View style={styles.replyItem}>
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.replyContent}>
        <Text style={styles.username}>{item.user.username}</Text>
        <Text style={styles.replyText}>{item.content}</Text>
        <Text style={styles.replyTime}>
          {new Date(item.createdAt).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Replies" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Replies" />
      {replies.length > 0 ? (
        <FlatList
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState title="No replies yet" message="Be the first to reply!" />
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
  replyItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontWeight: 'bold',
  },
  replyContent: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  replyText: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  replyTime: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

