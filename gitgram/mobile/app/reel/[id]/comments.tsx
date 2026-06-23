import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { reelService } from '../../../services/reelService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';
import { useAuthStore } from '../../../store/authStore';

export default function ReelCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) {
      loadComments(id);
    }
  }, [id]);

  const loadComments = async (reelId: string) => {
    try {
      setLoading(true);
      const response = await reelService.getReelComments(reelId);
      setComments(response.comments || []);
    } catch (error) {
      logger.error('Load reel comments error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !id) return;

    setSending(true);
    try {
      if (!id || typeof id !== 'string') return;
      const response = await reelService.createReelComment(id, commentText);
      setComments((prev) => [response.comment, ...prev]);
      setCommentText('');
    } catch (error) {
      logger.error('Send reel comment error:', error);
    } finally {
      setSending(false);
    }
  };

  const renderComment = ({ item }: { item: any }) => (
    <View style={styles.commentItem}>
      {item.user.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.commentContent}>
        <View style={styles.commentBubble}>
          <Text style={styles.commentUsername}>@{item.user.username}</Text>
          <Text style={styles.commentText}>{item.content}</Text>
        </View>
        <Text style={styles.commentTime}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Comments" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <Header title="Comments" />
      {comments.length > 0 ? (
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No comments yet"
          message="Be the first to comment!"
          icon="💬"
        />
      )}

      <View style={styles.inputContainer}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
        ) : (
          <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {user?.username?.[0].toUpperCase() || 'U'}
            </Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.textSecondary}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSendComment}
          disabled={sending || !commentText.trim()}
        >
          <Text style={styles.sendButtonText}>Post</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  commentItem: {
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  commentBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  commentTime: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
