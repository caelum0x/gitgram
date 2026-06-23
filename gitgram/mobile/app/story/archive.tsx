import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { storyService } from '../../services/storyService';
import { logger } from '../../utils/logger';

export default function StoryArchiveScreen() {
  const router = useRouter();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArchive();
  }, []);

  const loadArchive = async () => {
    try {
      const response = await storyService.getArchivedStories();
      setStories(response.stories || []);
    } catch (error) {
      logger.error('Load archive error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStory = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.storyItem}
      onPress={() => router.push(`/story/${item.id}`)}
    >
      {item.mediaUrl && (
        <Image source={{ uri: item.mediaUrl }} style={styles.storyImage} />
      )}
      <View style={styles.storyOverlay}>
        <Text style={styles.storyDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Story Archive" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Story Archive" />
      {stories.length > 0 ? (
        <FlatList
          data={stories}
          renderItem={renderStory}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No archived stories"
          message="Your expired stories will appear here"
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
  storyItem: {
    width: '33.33%',
    aspectRatio: 9 / 16,
    padding: 2,
    position: 'relative',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  storyOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 4,
  },
  storyDate: {
    fontSize: 10,
    color: Colors.text,
    textAlign: 'center',
  },
});

