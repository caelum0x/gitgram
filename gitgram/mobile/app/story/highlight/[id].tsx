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

export default function HighlightViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stories, setStories] = useState<Story[]>([]);
  const [title, setTitle] = useState('Highlight');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const response = await storyService.getHighlight(id);
      const highlight = response.highlight || response;
      setTitle(highlight.name || 'Highlight');
      setStories(highlight.stories || []);
    } catch (err) {
      logger.error('Load highlight error:', err);
      setError('This highlight is unavailable.');
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
        <Header title={title} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (error || stories.length === 0) {
    return (
      <View style={styles.container}>
        <Header title={title} />
        <EmptyState
          icon="📭"
          title="Nothing to show"
          message={error || 'This highlight has no stories yet.'}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={styles.viewer}>
      <StoryViewer stories={stories} initialIndex={0} onClose={() => router.back()} />
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
