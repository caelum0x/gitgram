import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import PostCard from '../../components/Post/PostCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { postService } from '../../services/postService';
import { logger } from '../../utils/logger';

export default function HashtagFeedScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadPosts();
  }, [tag]);

  const loadPosts = async (pageNum = 1, refresh = false) => {
    try {
      const response = await postService.searchPosts(`#${tag}`, pageNum, 20);
      if (refresh) {
        setPosts(response.posts || []);
      } else {
        setPosts((prev) => [...prev, ...(response.posts || [])]);
      }
      setHasMore(response.pagination?.page < response.pagination?.pages);
    } catch (error) {
      logger.error('Load hashtag posts error:', error);
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
        <Header title={`#${tag}`} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={`#${tag}`} />
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
              title={`No posts with #${tag}`}
              message="Be the first to post with this hashtag!"
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

