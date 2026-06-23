import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPost();
  }, [id]);

  const loadPost = async () => {
    try {
      const response = await postService.getPost(id!);
      setPost(response.post);
    } catch (error) {
      logger.error('Load post error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPost();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Post" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.container}>
        <Header title="Post" />
        <EmptyState title="Post not found" message="This post may have been deleted" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Post"
        rightIcon="more-vert"
        onRightPress={() => {
          // Show post menu
        }}
      />
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <PostCard post={post} showFullContent />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
});

