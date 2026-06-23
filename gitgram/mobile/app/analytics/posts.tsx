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
import { Image } from 'expo-image';
import { analyticsService } from '../../services/analyticsService';
import { postService } from '../../services/postService';

export default function PostAnalyticsScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPostAnalytics();
  }, []);

  const loadPostAnalytics = async () => {
    try {
      setLoading(true);
      // Get user's posts first
      const postsResponse = await postService.getPosts(1, 50);
      const userPosts = postsResponse.posts || [];
      
      // For each post, get analytics
      const postsWithAnalytics = await Promise.all(
        userPosts.map(async (post: any) => {
          try {
            const analytics = await analyticsService.getPostAnalytics(post.id);
            return {
              ...post,
              likesCount: analytics.analytics?.likes || post.likesCount || 0,
              commentsCount: analytics.analytics?.comments || post.commentsCount || 0,
              viewsCount: analytics.analytics?.views || 0,
            };
          } catch (error) {
            return post;
          }
        })
      );
      
      setPosts(postsWithAnalytics);
    } catch (error) {
      logger.error('Load post analytics error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPost = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.postItem}
      onPress={() => router.push(`/post/${item.id}`)}
    >
      {item.mediaUrl && (
        <Image source={{ uri: item.mediaUrl }} style={styles.postImage} />
      )}
      <View style={styles.postInfo}>
        <Text style={styles.postDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <View style={styles.postStats}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>❤️</Text>
            <Text style={styles.statValue}>{item.likesCount || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statValue}>{item.commentsCount || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>👁️</Text>
            <Text style={styles.statValue}>{item.viewsCount || 0}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Post Analytics" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Post Analytics" />
      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No post analytics"
          message="Analytics for your posts will appear here"
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
  postItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  postImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  postInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  postDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  postStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 16,
  },
  statValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
});

