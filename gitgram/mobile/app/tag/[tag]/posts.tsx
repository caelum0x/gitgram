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
import PostCard from '../../../components/Post/PostCard';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';

export default function TagPostsScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tag) {
      loadTagPosts(tag);
    }
  }, [tag]);

  const loadTagPosts = async (tagName: string) => {
    try {
      const response = await postService.searchPosts(`#${tagName}`);
      setPosts(response.posts || []);
    } catch (error) {
      logger.error('Load tag posts error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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
      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={({ item }) => <PostCard post={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title={`No posts with #${tag}`}
          message="Try searching for other tags"
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
    paddingBottom: 20,
  },
});

