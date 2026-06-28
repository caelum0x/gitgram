import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { logger } from '../../utils/logger';
import { postService } from '../../services/postService';

interface PostAuthor {
  username: string;
  avatar?: string;
}

interface Post {
  id: string;
  content: string;
  author: PostAuthor;
  likes: number;
  commentsCount: number;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
}

function formatTimestamp(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  const handleLike = async () => {
    if (likeLoading) return;

    const prevLiked = liked;
    const prevLikes = likes;

    setLiked(!prevLiked);
    setLikes(prev => (!prevLiked ? prev + 1 : prev - 1));
    setLikeLoading(true);

    try {
      const result = await postService.likePost(post.id);
      setLiked(result.liked);
      setLikes(
        result.likesCount !== undefined
          ? result.likesCount
          : result.liked ? prevLikes + 1 : prevLikes - 1,
      );
    } catch (error: unknown) {
      setLiked(prevLiked);
      setLikes(prevLikes);
      logger.error('PostCard: like failed', error);
    } finally {
      setLikeLoading(false);
    }
  };

  const handleCardPress = () => {
    router.push(`/post/${post.id}`);
  };

  const handleCommentPress = () => {
    router.push(`/post/${post.id}`);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleCardPress}
      activeOpacity={0.92}
    >
      {/* Header */}
      <View style={styles.header}>
        {post.author.avatar ? (
          <Image
            source={{ uri: post.author.avatar }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {post.author.username[0].toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.headerText}>
          <Text style={styles.username} numberOfLines={1}>
            {post.author.username}
          </Text>
          <Text style={styles.timestamp}>
            {formatTimestamp(post.createdAt)}
          </Text>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.content} numberOfLines={4}>
        {post.content}
      </Text>

      {/* Action Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLike}
          disabled={likeLoading}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {likeLoading ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : (
            <Text style={styles.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
          )}
          <Text style={[styles.actionCount, liked && styles.actionCountActive]}>
            {likes > 0 ? likes.toLocaleString() : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleCommentPress}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>
            {post.commentsCount > 0 ? post.commentsCount.toLocaleString() : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213E',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#0F3460',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
  },
  username: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  timestamp: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  content: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: '#0F3460',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionCount: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  actionCountActive: {
    color: '#E879A0',
  },
});
