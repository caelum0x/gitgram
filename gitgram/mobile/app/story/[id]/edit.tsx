import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { storyService } from '../../../services/storyService';
import { logger } from '../../../utils/logger';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { Image } from 'expo-image';

export default function StoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [story, setStory] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStory, setLoadingStory] = useState(true);

  useEffect(() => {
    loadStory();
  }, [id]);

  const loadStory = async () => {
    try {
      const response = await storyService.getStory(id!);
      setStory(response.story);
    } catch (error) {
      logger.error('Load story error:', error);
      Alert.alert('Error', 'Failed to load story');
      router.back();
    } finally {
      setLoadingStory(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    setLoading(true);
    try {
      await storyService.deleteStory(id!);
      Alert.alert('Success', 'Story deleted', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Delete story error:', error);
      Alert.alert('Error', 'Failed to delete story');
    } finally {
      setLoading(false);
    }
  };

  if (loadingStory) {
    return (
      <View style={styles.container}>
        <Header title="Edit Story" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!story) {
    return (
      <View style={styles.container}>
        <Header title="Edit Story" />
        <EmptyState title="Story not found" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Edit Story"
        rightIcon="delete"
        onRightPress={handleDelete}
      />
      <ScrollView style={styles.content}>
        {story.mediaUrl && (
          <Image
            source={{ uri: story.mediaUrl }}
            style={styles.media}
            contentFit="cover"
          />
        )}
        <Text style={styles.info}>
          Stories expire after 24 hours. You can delete this story before it expires.
        </Text>
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
    padding: 16,
  },
  media: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  info: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

