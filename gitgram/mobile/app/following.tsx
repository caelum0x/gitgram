import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Colors } from '../constants/Colors';
import Header from '../components/navigation/Header';
import PostCard from '../components/Post/PostCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { postService } from '../services/postService';
import { logger } from '../utils/logger';

export default function FollowingFeedScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async (pageNum = 1, refresh = false) => {
    try {
      const response = await postService.getFollowingFeed(pageNum, 20);
      const newPosts = response.posts || response || [];
      if (refresh) {
        setPosts(newPosts);
      } else {
        setPosts((prev) => [...prev, ...newPosts]);
      }
      // Handle pagination - check for hasMore flag or compare counts
      const hasMorePosts = response.pagination
        ? response.pagination.page < response.pagination.pages
        : newPosts.length === 20;
      setHasMore(hasMorePosts);
    } catch (error) {
      logger.error('Load following posts error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadPosts(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadPosts(nextPage);
    }
  };

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <Header title="Following" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Following" />
      <FlatList
        data={posts}
        renderItem={({ item }) => <PostCard post={item} />}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No posts from people you follow"
              message="Start following people to see their posts here!"
            />
          ) : null
        }
        ListFooterComponent={
          hasMore && posts.length > 0 ? <LoadingSpinner /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});

