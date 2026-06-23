import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { postService } from '../../../services/postService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';

export default function PostLikesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [likes, setLikes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadLikes(id);
    }
  }, [id]);

  const loadLikes = async (postId: string) => {
    try {
      setLoading(true);
      const response = await postService.getPostLikes(postId);
      setLikes(response.likes || []);
    } catch (error) {
      logger.error('Load likes error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => router.push(`/profile/${item.user.id}`)}
    >
      {item.user?.avatar ? (
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.user?.username?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.user?.username || 'unknown'}</Text>
        {item.user?.name && <Text style={styles.name}>{item.user.name}</Text>}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Likes" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Likes" />
      {likes.length > 0 ? (
        <FlatList
          data={likes}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No likes yet"
          message="Be the first to like this post!"
          icon="❤️"
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
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

