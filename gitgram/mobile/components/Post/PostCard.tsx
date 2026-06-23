import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';
import { postService } from '../../services/postService';
import { logger } from '../../utils/logger';
import { useAuthStore } from '../../store/authStore';
import PostOptionsModal from '../common/PostOptionsModal';
import ReportModal from '../common/ReportModal';
import CodeBlock from '../common/CodeBlock';
import RichContent from '../common/RichContent';

interface Post {
  id: string;
  userId: string;
  content?: string;
  mediaType: string;
  mediaUrl?: string;
  codeSnippet?: string;
  language?: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
  onLike?: () => void;
  onPress?: () => void;
  showFullContent?: boolean;
}

export default function PostCard({ post, onLike, showFullContent = false }: PostCardProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [loading, setLoading] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const isOwner = user?.id === post.user.id;

  const handleLike = async () => {
    if (loading) return;

    // Optimistic update - update UI immediately
    const previousIsLiked = isLiked;
    const previousLikesCount = likesCount;

    setIsLiked(!isLiked);
    setLikesCount(prev => !previousIsLiked ? prev + 1 : prev - 1);
    setLoading(true);

    try {
      const response = await postService.likePost(post.id);
      // Sync with server response (in case of race conditions)
      setIsLiked(response.liked);
      setLikesCount(response.likesCount || (response.liked ? previousLikesCount + 1 : previousLikesCount - 1));
      onLike?.();
    } catch (error) {
      // Rollback on failure
      setIsLiked(previousIsLiked);
      setLikesCount(previousLikesCount);
      logger.error('Like error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Card Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push(`/profile/${post.user.id}`)}
        >
          {post.user.avatar ? (
            <Image source={{ uri: post.user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{post.user.username[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.username}>{post.user.username}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.moreButton} onPress={() => setShowOptionsModal(true)}>
          <Text style={styles.moreIcon}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Project Visual */}
      {post.mediaType === 'image' && post.mediaUrl && (
        <TouchableOpacity
          onPress={() => !showFullContent && router.push(`/post/${post.id}`)}
          activeOpacity={showFullContent ? 1 : 0.9}
        >
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.media}
            contentFit="cover"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            cachePolicy="memory-disk"
          />
        </TouchableOpacity>
      )}

      {post.mediaType === 'code' && post.codeSnippet && (
        <View style={styles.codeWrapper}>
          <CodeBlock
            code={post.codeSnippet}
            language={post.language || 'text'}
            showLineNumbers={post.codeSnippet.split('\n').length > 3}
          />
        </View>
      )}

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.actionBarLeft}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLike}
            disabled={loading}
          >
            <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/post/${post.id}`)}
          >
            <Text style={styles.actionIcon}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/post/${post.id}/share`)}
          >
            <Text style={styles.actionIcon}>📤</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>🔖</Text>
        </TouchableOpacity>
      </View>

      {/* Engagement & Info */}
      <View style={styles.engagement}>
        <Text style={styles.likesText}>{likesCount.toLocaleString()} likes</Text>
        {post.content && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionUsername}>{post.user.username} </Text>
            <RichContent content={post.content} textStyle={styles.captionText} />
          </View>
        )}
        {post.commentsCount > 0 && (
          <TouchableOpacity onPress={() => router.push(`/post/${post.id}`)}>
            <Text style={styles.commentsLink}>
              View all {post.commentsCount} {post.commentsCount === 1 ? 'comment' : 'comments'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Chips/Tags */}
      {post.language && (
        <View style={styles.chipsContainer}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{post.language}</Text>
          </View>
        </View>
      )}

      {/* Options Modal */}
      <PostOptionsModal
        visible={showOptionsModal}
        onClose={() => setShowOptionsModal(false)}
        onReport={() => setShowReportModal(true)}
        onShare={() => router.push(`/post/${post.id}/share`)}
        isOwner={isOwner}
      />

      {/* Report Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="POST"
        targetId={post.id}
        targetName={post.content ? post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  username: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  moreButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  moreIcon: {
    fontSize: 24,
    color: Colors.text,
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: Colors.surface,
  },
  codeWrapper: {
    marginHorizontal: 16,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  actionBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  actionIcon: {
    fontSize: 24,
  },
  engagement: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  likesText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  captionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  captionText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  captionUsername: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 14,
    lineHeight: 20,
  },
  commentsLink: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    overflow: 'hidden',
  },
  chip: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: `${Colors.primary}33`, // 20% opacity
    paddingHorizontal: 12,
  },
  chipText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
});

