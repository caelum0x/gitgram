import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import PostCard from '../../components/Post/PostCard';
import { logger } from '../../utils/logger';
import { collectionService } from '../../services/collectionService';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CollectionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [collection, setCollection] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadCollection(id);
    }
  }, [id]);

  const loadCollection = async (collectionId: string) => {
    try {
      const response = await collectionService.getCollection(collectionId);
      setCollection(response.collection || response);
      setPosts(response.posts || []);
    } catch (error) {
      logger.error('Load collection error:', error);
      Alert.alert('Error', 'Failed to load collection');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Collection" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={styles.container}>
        <Header title="Collection" />
        <EmptyState title="Collection not found" message="This collection could not be found" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={collection.name}
        rightIcon="more-vert"
        onRightPress={() => {
          // Show collection options
        }}
      />
      {collection.description && (
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>{collection.description}</Text>
        </View>
      )}
      {posts.length > 0 ? (
        <FlatList
          data={posts}
          renderItem={({ item }) => (
            <PostCard post={item} onPress={() => router.push(`/post/${item.id}`)} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No posts in collection"
          message="Add posts to this collection to see them here"
          icon="📁"
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
  descriptionContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
});

