import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, FlatList, Dimensions, Share, Alert, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { reelService } from '../../services/reelService';
import ReelPlayer from '../../components/Reel/ReelPlayer';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface ReelEngagement {
  [reelId: string]: {
    isLiked: boolean;
    likesCount: number;
  };
}

interface Comment {
  id: string;
  content: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  createdAt: string;
}

export default function ReelsScreen() {
  const [reels, setReels] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [engagement, setEngagement] = useState<ReelEngagement>({});
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    loadReels();
  }, []);

  const loadReels = async () => {
    try {
      const response = await reelService.getReels(1, 10);
      const reelsData = response.reels || [];
      setReels(reelsData);

      // Initialize engagement state from reel data
      const initialEngagement: ReelEngagement = {};
      reelsData.forEach((reel: any) => {
        initialEngagement[reel.id] = {
          isLiked: reel.isLiked || false,
          likesCount: reel.likesCount || 0,
        };
      });
      setEngagement(initialEngagement);
    } catch (error) {
      console.error('Load reels error:', error);
    }
  };

  const handleLike = useCallback(async (reelId: string) => {
    // Optimistic update
    setEngagement(prev => {
      const current = prev[reelId] || { isLiked: false, likesCount: 0 };
      return {
        ...prev,
        [reelId]: {
          isLiked: !current.isLiked,
          likesCount: current.isLiked ? current.likesCount - 1 : current.likesCount + 1,
        },
      };
    });

    try {
      const response = await reelService.likeReel(reelId);
      // Sync with server response
      setEngagement(prev => ({
        ...prev,
        [reelId]: {
          isLiked: response.liked,
          likesCount: response.likesCount ?? prev[reelId].likesCount,
        },
      }));
    } catch (error) {
      // Rollback on failure
      console.error('Like reel error:', error);
      setEngagement(prev => {
        const current = prev[reelId];
        return {
          ...prev,
          [reelId]: {
            isLiked: !current.isLiked,
            likesCount: current.isLiked ? current.likesCount + 1 : current.likesCount - 1,
          },
        };
      });
      Alert.alert('Error', 'Failed to like reel. Please try again.');
    }
  }, []);

  const handleComment = useCallback(async (reelId: string) => {
    setSelectedReelId(reelId);
    setCommentModalVisible(true);
    setLoadingComments(true);

    try {
      const response = await reelService.getReelComments(reelId, 1, 50);
      setComments(response.comments || []);
    } catch (error) {
      console.error('Load comments error:', error);
      Alert.alert('Error', 'Failed to load comments.');
    } finally {
      setLoadingComments(false);
    }
  }, []);

  const submitComment = async () => {
    if (!selectedReelId || !newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await reelService.createReelComment(selectedReelId, newComment.trim());
      setComments(prev => [response.comment, ...prev]);
      setNewComment('');

      // Update comments count in reels state
      setReels(prev => prev.map(reel =>
        reel.id === selectedReelId
          ? { ...reel, commentsCount: (reel.commentsCount || 0) + 1 }
          : reel
      ));
    } catch (error) {
      console.error('Submit comment error:', error);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleShare = useCallback(async (reel: any) => {
    try {
      const shareUrl = `https://gitgram.app/reels/${reel.id}`;
      const message = reel.caption
        ? `Check out this reel on Gitgram: "${reel.caption}" - ${shareUrl}`
        : `Check out this reel on Gitgram: ${shareUrl}`;

      const result = await Share.share({
        message,
        url: shareUrl, // iOS only
        title: 'Share Reel',
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log('Shared with activity type:', result.activityType);
        } else {
          console.log('Reel shared successfully');
        }
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share reel.');
    }
  }, []);

  const closeCommentModal = () => {
    setCommentModalVisible(false);
    setSelectedReelId(null);
    setComments([]);
    setNewComment('');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const renderCommentItem = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <View style={styles.commentAvatar}>
        {item.user.avatar ? (
          <View style={styles.avatarImage}>
            <ThemedText style={styles.avatarText}>{item.user.username[0].toUpperCase()}</ThemedText>
          </View>
        ) : (
          <View style={styles.avatarImage}>
            <ThemedText style={styles.avatarText}>{item.user.username[0].toUpperCase()}</ThemedText>
          </View>
        )}
      </View>
      <View style={styles.commentContent}>
        <ThemedText style={styles.commentUsername}>{item.user.username}</ThemedText>
        <ThemedText style={styles.commentText}>{item.content}</ThemedText>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={reels}
        renderItem={({ item, index }) => {
          const reelEngagement = engagement[item.id] || { isLiked: false, likesCount: item.likesCount || 0 };
          return (
            <ReelPlayer
              reel={item}
              isActive={index === activeIndex}
              isLiked={reelEngagement.isLiked}
              likesCount={reelEngagement.likesCount}
              onLike={() => handleLike(item.id)}
              onComment={() => handleComment(item.id)}
              onShare={() => handleShare(item)}
            />
          );
        }}
        keyExtractor={item => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />

      {/* Comments Modal */}
      <Modal
        visible={commentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeCommentModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Comments</ThemedText>
                <TouchableOpacity onPress={closeCommentModal} style={styles.closeButton}>
                  <Icon name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* Comments List */}
              {loadingComments ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={styles.loadingText}>Loading comments...</ThemedText>
                </View>
              ) : (
                <FlatList
                  data={comments}
                  renderItem={renderCommentItem}
                  keyExtractor={item => item.id}
                  style={styles.commentsList}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <ThemedText style={styles.emptyText}>No comments yet. Be the first!</ThemedText>
                    </View>
                  }
                />
              )}

              {/* Comment Input */}
              <View style={styles.commentInputContainer}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment..."
                  placeholderTextColor={Colors.textSecondary}
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[
                    styles.postButton,
                    (!newComment.trim() || submittingComment) && styles.postButtonDisabled,
                  ]}
                  onPress={submitComment}
                  disabled={!newComment.trim() || submittingComment}
                >
                  <ThemedText style={styles.postButtonText}>
                    {submittingComment ? 'Posting...' : 'Post'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '70%',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    position: 'relative',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  commentsList: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  commentText: {
    color: Colors.text,
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    maxHeight: 100,
    marginRight: 12,
  },
  postButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
