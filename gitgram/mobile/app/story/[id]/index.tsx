import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import StoryViewer from '../../../components/Story/StoryViewer';
import { storyService } from '../../../services/storyService';
import { logger } from '../../../utils/logger';

interface Story {
  id: string;
  mediaType: string;
  mediaUrl: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const response = await storyService.getStory(id);
      const loaded: Story = response.story || response;
      setStory(loaded);
      // Record the view; failures here should not block playback.
      storyService.viewStory(id).catch((err) => logger.error('View story error:', err));
    } catch (err) {
      logger.error('Load story error:', err);
      setError('This story is unavailable or has expired.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Story" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.container}>
        <Header title="Story" />
        <EmptyState
          icon="📭"
          title="Story unavailable"
          message={error || 'This story could not be found.'}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={styles.viewer}>
      <StoryViewer stories={[story]} initialIndex={0} onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
