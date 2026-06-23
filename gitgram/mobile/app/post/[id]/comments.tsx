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
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';
import { useAuthStore } from '../../../store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';

export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadComments(id);
    }
  }, [id]);

  const loadComments = async (postId: string) => {
    try {
      setLoading(true);
      const response = await postService.getComments(postId);
      setComments(response.comments || []);
    } catch (error) {
      logger.error('Load comments error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !id) return;

    setSending(true);
    try {
      if (!id || typeof id !== 'string') return;
      const response = await postService.createComment(id, commentText);
      setComments((prev) => [response.comment, ...prev]);
      setCommentText('');
    } catch (error) {
      logger.error('Send comment error:', error);
    } finally {
      setSending(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!id) return;

    // Find current comment state for optimistic update
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const previousIsLiked = comment.isLiked;
    const previousLikesCount = comment.likesCount || 0;

    // Optimistic update - update UI immediately
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              isLiked: !previousIsLiked,
              likesCount: !previousIsLiked ? previousLikesCount + 1 : previousLikesCount - 1,
            }
          : c
      )
    );

    try {
      const response = await postService.likeComment(id, commentId);
      // Sync with server response
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isLiked: response.liked, likesCount: response.likesCount }
            : c
        )
      );
    } catch (error) {
      // Rollback on failure
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isLiked: previousIsLiked, likesCount: previousLikesCount }
            : c
        )
      );
      logger.error('Like comment error:', error);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!id || !editText.trim()) return;
    try {
      await postService.updateComment(id, commentId, editText);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, content: editText } : c
        )
      );
      setEditingCommentId(null);
      setEditText('');
    } catch (error) {
      logger.error('Edit comment error:', error);
      Alert.alert('Error', 'Failed to update comment');
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            try {
              await postService.deleteComment(id, commentId);
              setComments((prev) => prev.filter((c) => c.id !== commentId));
            } catch (error) {
              logger.error('Delete comment error:', error);
              Alert.alert('Error', 'Failed to delete comment');
            }
          },
        },
      ]
    );
  };

  const startEditing = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditText(comment.content);
    setMenuCommentId(null);
  };

  const isOwnComment = (comment: any) => comment.user?.id === user?.id;

  const renderComment = ({ item }: { item: any }) => (
    <View style={styles.commentItem}>
      {item.user?.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user?.username?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={styles.commentContent}>
        {editingCommentId === item.id ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEditComment(item.id)}
              >
                <Text style={styles.editButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditingCommentId(null);
                  setEditText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.commentBubble}>
              <Text style={styles.commentUsername}>@{item.user?.username}</Text>
              <Text style={styles.commentText}>{item.content}</Text>
            </View>
            <View style={styles.commentMeta}>
              <Text style={styles.commentTime}>
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              </Text>
              <TouchableOpacity
                style={styles.likeButton}
                onPress={() => handleLikeComment(item.id)}
              >
                <Ionicons
                  name={item.isLiked ? 'heart' : 'heart-outline'}
                  size={16}
                  color={item.isLiked ? '#ef4444' : Colors.textSecondary}
                />
                {(item.likesCount || 0) > 0 && (
                  <Text style={[styles.likeCount, item.isLiked && styles.likedCount]}>
                    {item.likesCount}
                  </Text>
                )}
              </TouchableOpacity>
              {isOwnComment(item) && (
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => setMenuCommentId(menuCommentId === item.id ? null : item.id)}
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {menuCommentId === item.id && isOwnComment(item) && (
              <View style={styles.menuDropdown}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => startEditing(item)}
                >
                  <Ionicons name="pencil-outline" size={16} color={Colors.text} />
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuCommentId(null);
                    handleDeleteComment(item.id);
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
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
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    marginTop: 4,
    gap: 12,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  likedCount: {
    color: '#ef4444',
  },
  menuButton: {
    padding: 4,
  },
  menuDropdown: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    marginLeft: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  menuItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  editContainer: {
    flex: 1,
  },
  editInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    minHeight: 60,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: Colors.text,
    fontSize: 14,
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

